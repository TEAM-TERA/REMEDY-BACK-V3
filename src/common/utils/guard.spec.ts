import { orThrow, assertOwnership } from './guard';

class TestError extends Error {}

describe('orThrow', () => {
  it('값이 있으면 그대로 반환한다', () => {
    const obj = { id: 'x' };
    expect(orThrow(obj, () => new TestError())).toBe(obj);
  });

  it('falsy 이지만 유효한 값(0/""/false)은 throw 하지 않는다', () => {
    expect(orThrow(0, () => new TestError())).toBe(0);
    expect(orThrow('', () => new TestError())).toBe('');
    expect(orThrow(false, () => new TestError())).toBe(false);
  });

  it('null / undefined 면 예외 팩토리로 throw 한다', () => {
    expect(() => orThrow(null, () => new TestError('nope'))).toThrow(TestError);
    expect(() => orThrow(undefined, () => new TestError('nope'))).toThrow(
      'nope',
    );
  });

  it('값이 있으면 예외 팩토리를 호출하지 않는다(부수효과 없음)', () => {
    const ex = jest.fn(() => new TestError());
    orThrow('ok', ex);
    expect(ex).not.toHaveBeenCalled();
  });
});

describe('assertOwnership', () => {
  it('소유자와 요청자가 같으면 통과한다', () => {
    expect(() => assertOwnership(1, 1, () => new TestError())).not.toThrow();
  });

  it('소유자와 요청자가 다르면 예외 팩토리로 throw 한다', () => {
    expect(() =>
      assertOwnership(1, 2, () => new TestError('forbidden')),
    ).toThrow('forbidden');
  });
});
