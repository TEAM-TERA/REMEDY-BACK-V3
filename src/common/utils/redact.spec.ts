import { maskUrlSecrets } from './redact';

describe('maskUrlSecrets', () => {
  it('token 쿼리 값을 마스킹한다', () => {
    expect(maskUrlSecrets('/notifications/subscribe?token=abc.def.ghi')).toBe(
      '/notifications/subscribe?token=[REDACTED]',
    );
  });

  it('access_token / refresh_token 도 마스킹한다', () => {
    expect(maskUrlSecrets('/cb?access_token=AAA')).toBe(
      '/cb?access_token=[REDACTED]',
    );
    expect(maskUrlSecrets('/cb?refresh_token=RRR')).toBe(
      '/cb?refresh_token=[REDACTED]',
    );
  });

  it('여러 파라미터 중 토큰만 가리고 나머지는 보존한다', () => {
    expect(maskUrlSecrets('/x?a=1&token=secret&b=2')).toBe(
      '/x?a=1&token=[REDACTED]&b=2',
    );
  });

  it('토큰이 없으면 URL 을 그대로 반환한다', () => {
    expect(maskUrlSecrets('/songs/search?query=iu')).toBe(
      '/songs/search?query=iu',
    );
  });
});
