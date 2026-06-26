import { isAxiosError } from 'axios';

/** 재시도 가치가 있다고 보는 네트워크/타임아웃 계열 axios code */
const TRANSIENT_AXIOS_CODES = new Set([
  'ECONNABORTED', // axios timeout
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EPIPE',
]);

/**
 * 일시적(재시도 가치 있음) HTTP 오류인지 판별한다.
 * - HTTP 응답 status 가 429(rate limit) 또는 5xx(>=500)
 * - 응답이 없는 네트워크/타임아웃 오류(위 axios code, 또는 response 가 없는 axios 에러)
 * 그 외(429 제외 4xx, 비-axios 에러)는 비일시적 → false.
 */
export function isTransientHttpError(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }

  // 응답 자체가 없는 경우(네트워크/타임아웃): code 매칭, 불명확하면 일시적으로 간주.
  if (error.code && TRANSIENT_AXIOS_CODES.has(error.code)) {
    return true;
  }
  // 응답이 없는 axios 에러는 대체로 네트워크 단계 실패 → 재시도 가치 있음.
  return error.response === undefined;
}

export interface RetryTransientOptions {
  /** 최초 시도 외 추가 재시도 횟수(기본 2) */
  retries?: number;
  /** 지수 백오프 기준 지연(기본 150ms) */
  baseDelayMs?: number;
  /** 단일 지연 상한(기본 1000ms) — 큰 Retry-After 에도 매달리지 않게 캡 */
  maxDelayMs?: number;
  /** 재시도 직전 콜백(호출부 로깅용) */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 150;
const DEFAULT_MAX_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 429 응답의 Retry-After 헤더(초 단위)를 best-effort 로 파싱한다.
 * 숫자(초)만 지원하며, 음수/비숫자/없음이면 null.
 */
function parseRetryAfterMs(error: unknown): number | null {
  if (!isAxiosError(error) || error.response?.status !== 429) {
    return null;
  }
  const header: unknown = error.response.headers?.['retry-after'];
  if (header === undefined || header === null) {
    return null;
  }
  const value: unknown = Array.isArray(header) ? header[0] : header;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds * 1000;
}

/** 다음 재시도까지의 지연(ms) 계산: 지수 백오프 + 지터, Retry-After 참고, maxDelayMs 캡 */
function computeDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  error: unknown,
): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelayMs;
  let delay = exponential + jitter;

  const retryAfter = parseRetryAfterMs(error);
  if (retryAfter !== null) {
    // 서버 권고치를 참고하되 maxDelayMs 로 캡(30초 같은 큰 값에 매달리지 않게).
    delay = Math.max(delay, retryAfter);
  }

  return Math.min(delay, maxDelayMs);
}

/**
 * fn 을 실행하고 일시적 오류(isTransientHttpError)에 한해 지수 백오프로 재시도한다.
 * - 비일시적 오류이거나 재시도 소진 시 **원본 에러를 그대로 throw**(호출부 502 변환 유지).
 * - 성공 시 즉시 값 반환.
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  opts: RetryTransientOptions = {},
): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let attempt = 0;
  // 최대 retries 회 재시도(총 retries+1 회 시도).
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isTransientHttpError(error)) {
        throw error;
      }
      const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs, error);
      opts.onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
}
