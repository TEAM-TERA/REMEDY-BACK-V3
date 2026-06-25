import { Prisma } from '@prisma/client';

/**
 * 앱 도메인 payload 객체를 Prisma JSONB write 타입(`InputJsonValue`)으로 변환한다.
 *
 * `Prisma.InputJsonValue` 는 우리 도메인 payload(인터페이스) 타입을 직접 받지 못해
 * 단언이 필요한데(직렬화 가능한 평범한 객체 전제), 이 단언을 서비스 곳곳에 흩뿌리지 않고
 * 한 곳에 모아 의도를 명시한다. JSONB 컬럼에 쓰는 모든 payload 는 이 헬퍼를 거친다.
 */
export function toInputJson(value: object): Prisma.InputJsonValue {
  return value;
}
