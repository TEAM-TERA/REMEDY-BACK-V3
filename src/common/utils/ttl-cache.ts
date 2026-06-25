/**
 * 의존성 없는 인메모리 TTL 캐시.
 * - 단일 프로세스 한정(다중 인스턴스 확장 시 Redis 등으로 교체).
 * - 읽기 시 만료 검사, 최대 크기 초과 시 가장 오래된 항목부터 제거(삽입 순서 기반).
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) {
      return undefined;
    }
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    // 용량 초과 시 가장 먼저 삽입된 키 제거(Map 은 삽입 순서 보존)
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // 가장 먼저 삽입된 키 1개 제거(Map 삽입 순서)
      for (const oldest of this.store.keys()) {
        this.store.delete(oldest);
        break;
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
