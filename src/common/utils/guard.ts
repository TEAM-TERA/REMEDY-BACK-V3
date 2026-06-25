/**
 * 공통 가드 유틸 (의존성 없음).
 *
 * 서비스 전반에서 반복되던 "조회 후 없으면 throw" / "소유자 아니면 throw" 패턴을
 * 한 줄로 표준화한다. 쿼리(select/include 등)와 던질 예외는 호출부가 그대로 통제하고,
 * 여기서는 null 검사·소유권 비교만 담당한다.
 */

/** 값이 null/undefined 면 예외를 던지고, 아니면 그대로 반환한다. */
export function orThrow<T>(value: T | null | undefined, ex: () => Error): T {
  if (value == null) {
    throw ex();
  }
  return value;
}

/** 소유자 id 와 요청 사용자 id 가 다르면 예외를 던진다. */
export function assertOwnership(
  ownerId: number,
  userId: number,
  ex: () => Error,
): void {
  if (ownerId !== userId) {
    throw ex();
  }
}
