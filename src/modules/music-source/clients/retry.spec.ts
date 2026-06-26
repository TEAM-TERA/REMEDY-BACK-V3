import { AxiosError, AxiosHeaders } from 'axios';
import { isTransientHttpError, retryTransient } from './retry';

/** status 응답을 가진 가짜 AxiosError 생성 */
function axiosErrorWithStatus(
  status: number,
  headers?: Record<string, string>,
): AxiosError {
  const error = new AxiosError('boom', 'ERR_BAD_RESPONSE');
  error.response = {
    status,
    statusText: '',
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
    data: {},
  };
  return error;
}

/** 응답 없는(네트워크/타임아웃) 가짜 AxiosError 생성 */
function axiosNetworkError(code: string): AxiosError {
  return new AxiosError('network', code);
}

describe('isTransientHttpError', () => {
  it('429 / 5xx 응답은 일시적이다', () => {
    expect(isTransientHttpError(axiosErrorWithStatus(429))).toBe(true);
    expect(isTransientHttpError(axiosErrorWithStatus(500))).toBe(true);
    expect(isTransientHttpError(axiosErrorWithStatus(503))).toBe(true);
  });

  it('429 제외 4xx 는 비일시적이다', () => {
    expect(isTransientHttpError(axiosErrorWithStatus(400))).toBe(false);
    expect(isTransientHttpError(axiosErrorWithStatus(401))).toBe(false);
    expect(isTransientHttpError(axiosErrorWithStatus(404))).toBe(false);
  });

  it('네트워크/타임아웃(응답 없음) code 는 일시적이다', () => {
    expect(isTransientHttpError(axiosNetworkError('ECONNABORTED'))).toBe(true);
    expect(isTransientHttpError(axiosNetworkError('ETIMEDOUT'))).toBe(true);
    expect(isTransientHttpError(axiosNetworkError('ECONNRESET'))).toBe(true);
    expect(isTransientHttpError(axiosNetworkError('ENOTFOUND'))).toBe(true);
  });

  it('비-axios 에러는 비일시적이다', () => {
    expect(isTransientHttpError(new Error('plain'))).toBe(false);
    expect(isTransientHttpError('string')).toBe(false);
    expect(isTransientHttpError(null)).toBe(false);
  });
});

describe('retryTransient', () => {
  it('성공 시 즉시 값을 반환하고 fn 을 1회만 호출한다', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retryTransient(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('일시적 에러(429) 후 성공하면 재시도하여 값을 반환한다', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(axiosErrorWithStatus(429))
      .mockResolvedValue('recovered');
    await expect(
      retryTransient(fn, { baseDelayMs: 0, retries: 2 }),
    ).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('일시적 에러(500) 후 성공', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(axiosErrorWithStatus(500))
      .mockResolvedValue('recovered');
    await expect(retryTransient(fn, { baseDelayMs: 0 })).resolves.toBe(
      'recovered',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('타임아웃 후 성공', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(axiosNetworkError('ECONNABORTED'))
      .mockResolvedValue('recovered');
    await expect(retryTransient(fn, { baseDelayMs: 0 })).resolves.toBe(
      'recovered',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('재시도 소진 시 원본 에러를 그대로 throw 한다', async () => {
    const err = axiosErrorWithStatus(500);
    const fn = jest.fn().mockRejectedValue(err);
    await expect(
      retryTransient(fn, { baseDelayMs: 0, retries: 2 }),
    ).rejects.toBe(err);
    // 최초 1회 + 재시도 2회 = 3회
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('비일시적 에러(400/401/404)는 재시도 없이 즉시 throw 한다', async () => {
    for (const status of [400, 401, 404]) {
      const err = axiosErrorWithStatus(status);
      const fn = jest.fn().mockRejectedValue(err);
      await expect(retryTransient(fn, { baseDelayMs: 0 })).rejects.toBe(err);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('비-axios 에러는 재시도하지 않는다', async () => {
    const err = new Error('plain');
    const fn = jest.fn().mockRejectedValue(err);
    await expect(retryTransient(fn, { baseDelayMs: 0 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 시 onRetry 콜백을 호출한다', async () => {
    const onRetry = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(axiosErrorWithStatus(429))
      .mockResolvedValue('ok');
    await retryTransient(fn, { baseDelayMs: 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.anything(),
    );
  });

  it('Retry-After 헤더가 maxDelayMs 로 캡된다(30초에 매달리지 않음)', async () => {
    const start = Date.now();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(axiosErrorWithStatus(429, { 'retry-after': '30' }))
      .mockResolvedValue('ok');
    await expect(
      retryTransient(fn, { baseDelayMs: 0, maxDelayMs: 50 }),
    ).resolves.toBe('ok');
    // 30초가 아니라 maxDelayMs(50ms) 안쪽으로 끝나야 한다.
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
