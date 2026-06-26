/**
 * URL 쿼리스트링의 민감 토큰 값을 마스킹한다(로그·에러 응답에 평문 노출 방지).
 *
 * 대상: `token`, `access_token`, `refresh_token` (대소문자 무시, 모든 출현).
 * SSE 구독(`/notifications/subscribe?token=<JWT>`)처럼 비밀을 쿼리로 받는 경로를
 * 로그·예외 응답에 안전하게 남기기 위해, 로깅 직렬화와 전역 예외 필터가 공통으로 사용한다.
 */
export function maskUrlSecrets(url: string): string {
  return url.replace(
    /([?&](?:access_token|refresh_token|token)=)[^&]*/gi,
    '$1[REDACTED]',
  );
}
