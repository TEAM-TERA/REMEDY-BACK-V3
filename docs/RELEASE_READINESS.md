# REMEDY 출시 전 실환경 점검 체크리스트

배포 직전, **로컬에서 실제 키·실제 DB로** 한 번 끝까지 돌려 "실제 환경에서 잘 도는가"를 확인하기 위한 문서다.
mock E2E(99개)는 로직을 보장하지만, 외부 API 실호출·관측성·동시성은 검증하지 못한다. 이 체크리스트가 그 공백을 메운다.

> 사용 시점: 새 환경(스테이징/프로덕션)에 처음 배포하기 직전, 그리고 외부 키/DB 설정을 바꿨을 때.
> 진행 방식: 위에서부터 순서대로, 각 항목을 실제로 실행해보고 `[x]` 로 체크한다.

---

## 0. 사전 준비

- [ ] `.env` 에 **실제** 값 채움: `DATABASE_URL`, `JWT_SECRET`(16자+), `SPOTIFY_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY`, 필요 시 `GOOGLE/KAKAO/NAVER_CLIENT_ID/SECRET`, `AWS_S3_*`, `CORS_ORIGINS`.
- [ ] 프로덕션은 `NODE_ENV=production` (JSON 로그). 스테이징도 권장.
- [ ] 비밀값은 `.env`(gitignore)에만. `.env.test`·`.env.example` 에 실비밀값 금지(추적 파일).
- [ ] 대상 DB가 PostgreSQL + **PostGIS + pg_trgm** 확장을 지원하는지 확인(거리검색·검색 인덱스 필수).

---

## A. 환경 / 설정

- [ ] 필수 env 누락 시 부팅이 **즉시 실패**하는지 확인(잘못된 설정으로 뜨지 않게).
      → `JWT_SECRET` 를 일부러 비우고 `node dist/main` → 부팅 실패 로그 확인 후 복구.
- [ ] `PORT`, `CORS_ORIGINS` 가 배포 환경에 맞는지(프런트 도메인 화이트리스트).

## B. DB / 마이그레이션

- [ ] `npx prisma migrate deploy` 가 대상 DB에서 성공(4개 마이그레이션 적용).
- [ ] 마이그레이션 후 PostGIS GiST 인덱스 / pg_trgm GIN 인덱스 / 위치 트리거가 생성됐는지 확인
      (모두 `prisma/migrations/.../migration.sql` 에 포함 — 드리프트 없음).
- [ ] readiness 가 DB를 본다: 아래 C 의 `/health/ready` 200 확인.

## C. 부팅 / 관측성

- [ ] `node dist/main` 부팅 성공, 시작 로그가 **JSON 구조화**로 출력(prod 기준).
- [ ] `GET /api/v1/health` → `200 {status:"ok"}` (liveness).
- [ ] `GET /api/v1/health/ready` → `200 {status:"ok",db:"up"}`. DB를 내려보고 `503` 도 확인.
- [ ] 아무 요청이나 한 번 → 응답 헤더에 `x-request-id` 존재, 로그에 같은 `reqId`로 "request completed"(method/url/status/응답시간) 기록.
- [ ] 로그에 **민감정보가 안 남는지**: `Authorization` 헤더, SSE `/notifications/subscribe?token=...` 의 토큰이 마스킹/제거되는지 확인.
- [ ] **Graceful shutdown**: 떠 있는 프로세스에 `kill -TERM <pid>` → 진행 중 요청 마무리 + DB·SSE 정리 후 깔끔히 종료(무한 대기 없음).
- [ ] (오케스트레이터 사용 시) liveness=`/api/v1/health`, readiness=`/api/v1/health/ready` 로 프로브 설정.

## D. 외부 API 실키 스모크 (★ mock으로는 검증 불가)

- [ ] **Spotify 검색**: `GET /api/v1/songs/search?query=아이유` → 실제 결과. 자격증명/토큰 발급 동작 확인.
- [ ] **검색 레이트리밋**: 같은 IP로 한도(기본 30회/60s) 초과 시 `429`.
- [ ] **드랍 생성 → 곡 캐시 + YouTube 매칭**: MUSIC 드랍 생성 후 `songs` 행 생성 확인.
      `youtubeChecked=true` 면 매칭 성공, `false` 면 쿼터/키 문제(미확인 처리 — 주 흐름은 성공해야 정상).
- [ ] **재생 링크**: 곡 응답의 `playLinks` 에 Spotify 항상, YouTube는 매칭 시 포함.
- [ ] **OAuth2 로그인**: 사용하는 provider(google/kakao/naver) 각각 실제 토큰으로 `POST /api/v1/oauth2/<provider>` → 신규 가입/로그인 정상, 프로필(이름/생년월일/성별) 파싱 정상.
- [ ] **일시 장애 내성(선택)**: 네트워크를 잠깐 끊거나 잘못된 키로 호출 → 즉시 죽지 않고 재시도 후 `502`(음원) / `401`(oauth2) 로 일관 응답. 로그에 "재시도 N" warn 확인.

## E. 데이터 무결성 / 동시성

- [ ] **플레이리스트 동시 곡 추가**: 같은 플레이리스트에 동일 곡을 거의 동시에 2회 추가 요청 →
      하나만 성공(201), 다른 하나는 `409 SONG_ALREADY_IN_PLAYLIST`. (중복 입력이 발생하면 안 됨 — 트랜잭션으로 보호됨.)
- [ ] **드랍 1m 중복**: 같은 위치에서 1분 내 재드랍 시 차단되는지(Serializable + 재시도).
- [ ] **좋아요 더블탭**: 빠르게 두 번 → 중복 좋아요가 안 생기는지(unique + P2002 멱등 처리).
- [ ] **참조 무결성**: 곡은 하드삭제하지 않는다(참조 캐시). 사용자/드랍은 soft delete — 탈퇴 후에도 알림 스냅샷 유지, `actorId` null.

## F. 보안 / 비밀값

- [ ] `git grep` 로 실비밀값이 추적 파일에 없는지 최종 확인.
- [ ] JWT 만료(`JWT_EXPIRES_IN`), CORS, 인증 가드가 보호 대상 라우트에 걸려 있는지.
- [ ] 업로드 크기 제한(프로필 이미지 5MB) 동작.

---

## 런북 (명령어 모음)

```bash
# 빌드
pnpm install --frozen-lockfile && pnpm prisma generate && pnpm run build

# 마이그레이션(대상 DB)
npx prisma migrate deploy

# 실행(프로덕션)
NODE_ENV=production node dist/main

# 헬스 점검
curl -i http://localhost:3000/api/v1/health        # liveness
curl -i http://localhost:3000/api/v1/health/ready   # readiness(DB)

# graceful shutdown
kill -TERM <pid>        # 또는 오케스트레이터의 SIGTERM
```

로컬에서 실키로 점검만 하려면 `.env` 에 실제 키를 넣고 `NODE_ENV` 미설정(=pretty 로그)으로 `node dist/main` 후 위 D/E 시나리오를 수동 호출한다.

---

## 알려진 한계 / 후속 (Deferred)

이번 출시 준비 범위에서 **의도적으로 제외**했거나 후속으로 남긴 항목:

- **에러추적·지표 미도입**: Sentry/Prometheus 는 외부 계정/스크레이퍼가 필요해 제외. 현재는 구조화 로그(stdout)로 수집기 친화. 운영 시작 후 필요해지면 `LoggingModule` 옆에 env-gated 로 추가 권장.
- **Spotify 토큰 stale 폴백 미도입**: 토큰 갱신 실패는 재시도로 흡수하되, 만료 토큰 재사용 폴백은 401 루프 위험이 커 넣지 않음. 장기 장애는 502로 빠르게 실패.
- **드랍 생성 사용자별 throttle 없음**: 악의적 대량 드랍 시 YouTube 쿼터 소진 가능. 필요 시 사용자 단위 ThrottlerGuard 추가.
- **다중 인스턴스 SSE**: 알림 SSE는 단일 프로세스 메모리 기반. 수평 확장 시 Redis Pub/Sub 팬아웃 필요(`notification.emitter.ts` 주석 참고).
- **부팅 시 `/api/v1/*` path-to-regexp deprecation 경고**: Nest 11/Express 5 전환 경고(자동 변환됨). 동작엔 영향 없음.
- **like e2e 스펙의 순서 의존**: 전체 스위트 첫 실행(콜드 DB)에서 드물게 like 카운트 단언이 흔들릴 수 있음(토글 상태 누적 가정). 재실행 시 통과. 테스트 격리 보강은 후속.
- **YT 미확인(checked=false) 곡 재-resolve 배치**: 쿼터/키 문제로 미확인된 곡을 나중에 재매칭하는 작업(정책 결정 후).
