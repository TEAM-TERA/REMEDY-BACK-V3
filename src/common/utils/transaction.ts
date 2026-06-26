import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Serializable 트랜잭션 실행 유틸 (의존성 없음).
 *
 * 읽기-검증-쓰기를 하나의 Serializable 트랜잭션으로 원자화해 동시 요청의
 * lost update / 중복 입력을 방지한다. 동시 요청이 직렬화에 실패하면 Postgres 가
 * serialization_failure(Prisma P2034) 를 던지는데, 이를 그대로 흘리지 않고
 * 제한된 횟수만큼 재시도한다.
 *
 * PrismaService 는 PrismaClient 를 상속하므로 `this.prisma` 를 그대로 넘길 수 있다.
 */

/** Serializable 직렬화 충돌(P2034) 시 최대 재시도 횟수 */
const SERIALIZABLE_MAX_ATTEMPTS = 3;

export async function runSerializable<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < SERIALIZABLE_MAX_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }
}
