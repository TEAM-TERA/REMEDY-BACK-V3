import { Prisma, PrismaClient } from '@prisma/client';
import { runSerializable } from './transaction';

/** P2034(직렬화 충돌) 에러 생성 헬퍼 */
function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('serialization failure', {
    code: 'P2034',
    clientVersion: 'x',
  });
}

/** $transaction 만 가진 가짜 PrismaClient */
function fakePrisma(transaction: jest.Mock): PrismaClient {
  return { $transaction: transaction } as unknown as PrismaClient;
}

describe('runSerializable', () => {
  it('성공하면 결과를 반환하고 트랜잭션을 1회만 실행한다', async () => {
    const tx = jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({}));
    const prisma = fakePrisma(tx);

    const result = await runSerializable(prisma, () => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect(tx).toHaveBeenCalledTimes(1);
    // Serializable 격리 수준으로 호출되는지 확인
    expect(tx.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('P2034 가 1회 발생한 뒤 성공하면 재시도해 결과를 반환한다', async () => {
    const tx = jest
      .fn()
      .mockRejectedValueOnce(p2034())
      .mockResolvedValueOnce('ok');
    const prisma = fakePrisma(tx);

    const result = await runSerializable(prisma, () => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect(tx).toHaveBeenCalledTimes(2);
  });

  it('P2034 가 최대 횟수를 넘게 계속되면 최종적으로 throw 한다', async () => {
    const tx = jest.fn().mockRejectedValue(p2034());
    const prisma = fakePrisma(tx);

    await expect(
      runSerializable(prisma, () => Promise.resolve('ok')),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    // 최대 시도 횟수(3) 만큼 실행 후 포기
    expect(tx).toHaveBeenCalledTimes(3);
  });

  it('P2034 가 아닌 에러는 재시도 없이 즉시 throw 한다', async () => {
    const tx = jest.fn().mockRejectedValue(new Error('boom'));
    const prisma = fakePrisma(tx);

    await expect(
      runSerializable(prisma, () => Promise.resolve('ok')),
    ).rejects.toThrow('boom');
    expect(tx).toHaveBeenCalledTimes(1);
  });
});
