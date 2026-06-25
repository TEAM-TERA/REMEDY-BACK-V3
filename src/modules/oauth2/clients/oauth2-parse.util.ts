/**
 * provider userinfo 응답 파싱 공통 유틸 (의존성 없는 순수 함수 모음).
 * - 3개 클라이언트(Google/Kakao/Naver)에 중복돼 있던 헬퍼를 추출한 것이다.
 * - 동작은 원본 클라이언트 구현과 100% 동일해야 한다(반환 형식·null 처리 보존).
 */

/** 비어있지 않은 문자열만 반환, 그 외는 null (원본 asString 동일) */
export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 객체(non-null)만 Record 로 반환, 그 외는 null (원본 asObject 동일) */
export function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 생년월일 파싱 공통 코어.
 * provider 마다 birthday 포맷이 다르므로(kakao=MMDD, naver=MM-DD) 월/일 추출만
 * extractMonthDay 콜백으로 파라미터화하고, 나머지 검증·생성 로직은 공유한다.
 *
 * 동작 보존 규칙(원본 kakao/naver getBirthDate 와 동일):
 * - birthday/birthyear 가 비어있지 않은 문자열이어야 한다.
 * - birthyear 는 4자리여야 한다.
 * - 월/일 추출(extractMonthDay)이 null 을 반환하면(포맷 불일치) null.
 * - year/month/day 가 모두 정수여야 한다.
 * - 유효하면 UTC 자정 Date 생성(Prisma @db.Date 매핑), 아니면 null.
 *
 * @param birthday provider 의 birthday 원시값
 * @param birthyear provider 의 birthyear 원시값
 * @param extractMonthDay 검증된 birthday 문자열에서 {month, day} 문자열을 추출(불일치 시 null)
 */
export function parseBirthDate(
  birthday: unknown,
  birthyear: unknown,
  extractMonthDay: (birthday: string) => { month: string; day: string } | null,
): Date | null {
  const birthdayStr = asString(birthday);
  const birthyearStr = asString(birthyear);
  if (birthdayStr === null || birthyearStr === null) {
    return null;
  }
  if (birthyearStr.length !== 4) {
    return null;
  }
  const monthDay = extractMonthDay(birthdayStr);
  if (monthDay === null) {
    return null;
  }
  const year = Number.parseInt(birthyearStr, 10);
  const month = Number.parseInt(monthDay.month, 10);
  const day = Number.parseInt(monthDay.day, 10);
  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day)
  ) {
    // UTC 자정으로 생성 (Prisma @db.Date 매핑)
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}
