import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
} from '@nestjs/common';
import { Observable, Subject, interval, merge, of } from 'rxjs';
import { finalize, map, takeUntil } from 'rxjs/operators';

/**
 * SSE 연결 레지스트리 (원본 SseEmitterRepository + SseEmitterManager 이식).
 *
 * 원본은 in-memory ConcurrentHashMap<userId, SseEmitter> 였다. NestJS 는 @Sse 가
 * Observable<MessageEvent> 를 반환하는 모델이므로, 사용자별 RxJS Subject 집합으로
 * 관리한다. 한 사용자가 여러 탭/기기에서 동시에 구독할 수 있으므로 Set 으로 보관한다.
 *
 * 주의: 이 레지스트리는 단일 인스턴스(프로세스) 메모리에만 존재한다. 다중 인스턴스로
 * 수평 확장 시에는 Redis Pub/Sub 등 외부 브로커로 팬아웃해야 한다(후속 과제).
 */
@Injectable()
export class NotificationEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationEmitter.name);

  /** 연결 유지용 heartbeat 주기(ms). 프록시의 idle 타임아웃으로 끊기는 것을 방지 */
  private static readonly HEARTBEAT_INTERVAL_MS = 30_000;

  private readonly streams = new Map<number, Set<Subject<MessageEvent>>>();

  /** 종료 신호. next 되면 모든 활성 SSE 스트림이 takeUntil 로 완료된다. */
  private readonly shutdown$ = new Subject<void>();

  /**
   * 사용자의 SSE 스트림을 생성한다.
   * - 연결 직후 `connect` 더미 이벤트를 보내 즉시 200 응답이 흐르도록 한다(원본과 동일 의도).
   * - 주기적으로 `ping` heartbeat 를 흘려 연결을 유지한다.
   * - 클라이언트 연결 종료 시 finalize 에서 자동 정리한다.
   */
  subscribe(userId: number): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    let set = this.streams.get(userId);
    if (!set) {
      set = new Set();
      this.streams.set(userId, set);
    }
    set.add(subject);
    const connections = set.size;
    this.logger.log(`SSE 연결 - userId=${userId} (connections=${connections})`);

    const connect$ = of<MessageEvent>({
      type: 'connect',
      data: { message: 'connected' },
    });
    const heartbeat$ = interval(NotificationEmitter.HEARTBEAT_INTERVAL_MS).pipe(
      map<number, MessageEvent>(() => ({ type: 'ping', data: {} })),
    );

    // 연결 종료(클라이언트 close) 시 NestJS @Sse 가 이 Observable 을 unsubscribe 하며,
    // merge 로 합쳐진 heartbeat interval 도 RxJS 가 함께 정리한다(타이머 누수 없음).
    // finalize 는 추가로 레지스트리(Map/Set)에서 해당 연결을 제거한다.
    return merge(connect$, subject.asObservable(), heartbeat$).pipe(
      // 종료 훅(onModuleDestroy)에서 shutdown$ 가 흐르면 스트림을 완료해 연결을 닫는다.
      // (heartbeat interval 은 스스로 끝나지 않으므로 takeUntil 로 명시 종료해야 한다.)
      takeUntil(this.shutdown$),
      finalize(() => {
        const current = this.streams.get(userId);
        if (current) {
          current.delete(subject);
          if (current.size === 0) {
            this.streams.delete(userId);
          }
        }
        subject.complete();
        this.logger.log(`SSE 연결 종료 - userId=${userId}`);
      }),
    );
  }

  /**
   * 특정 사용자의 모든 활성 연결에 이벤트를 푸시한다.
   * 연결이 없으면(오프라인) 조용히 생략한다 — 알림 자체는 DB 에 영속화되어 있으므로
   * 사용자는 이후 접속 시 GET /notifications 로 받을 수 있다.
   */
  push(userId: number, event: MessageEvent): void {
    const set = this.streams.get(userId);
    if (!set || set.size === 0) {
      this.logger.debug(`SSE 미연결 - userId=${userId}, 실시간 푸시 생략`);
      return;
    }
    // 한 연결에서 동기 예외가 나도 같은 사용자의 다른 탭 푸시를 막지 않도록 격리한다.
    for (const subject of set) {
      try {
        subject.next(event);
      } catch (error) {
        this.logger.warn(
          `SSE 푸시 실패(연결 1건) - userId=${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** 사용자가 현재 SSE 로 연결되어 있는지 여부 */
  isConnected(userId: number): boolean {
    const set = this.streams.get(userId);
    return set !== undefined && set.size > 0;
  }

  /**
   * 종료 훅: 열린 모든 SSE 스트림을 완료시켜 연결을 닫는다.
   * 장수 연결(SSE)을 닫지 않으면 graceful shutdown 시 서버가 연결 종료를 기다리며 멈춘다.
   */
  onModuleDestroy(): void {
    this.shutdown$.next();
    this.shutdown$.complete();
  }
}
