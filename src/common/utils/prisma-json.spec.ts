import { toInputJson } from './prisma-json';

describe('toInputJson', () => {
  it('객체를 그대로(동일 참조) 반환한다 — 직렬화는 Prisma 가 수행', () => {
    const payload = { songId: 'abc', options: ['a', 'b'] };
    expect(toInputJson(payload)).toBe(payload);
  });

  it('빈 객체도 그대로 반환한다', () => {
    const empty = {};
    expect(toInputJson(empty)).toBe(empty);
  });
});
