# REMEDY 백엔드 컨벤션

Spring Boot → NestJS 11 이전 프로젝트의 코드 컨벤션을 한 곳에 정리한다.
새 코드는 이 문서를 기준으로 작성하고, 기존 코드는 해당 파일을 건드릴 때 점진적으로 맞춘다.

> 적용 스택: NestJS 11 · Prisma 6(Postgres/PostGIS/pg_trgm) · TypeScript · class-validator · @nestjs/swagger · pnpm

---

## 1. 모듈 구조

각 도메인은 `src/modules/<domain>/` 아래 다음 레이아웃을 따른다.

```
src/modules/<domain>/
  <domain>.module.ts
  <domain>.controller.ts
  <domain>.service.ts
  dto/            # 요청·응답 DTO
  exceptions/     # 도메인 전용 예외 (공통 예외는 src/common/exceptions/)
```

- 도메인 특성상 추가 디렉터리/파일을 둘 수 있다. 예: `notification/`의 `guards/`, `notification.emitter.ts`, `notification.types.ts`.
- 외부 소스 연동 모듈은 `clients/`(또는 `resolver`) 하위에 추상 토큰 + 구현을 둔다. 예: `music-source/clients/`, `oauth2/clients/`.
- 순수 인프라/단순 모듈은 일부 파일을 생략할 수 있다. 예: `health/`는 controller만 둔다.

---

## 2. 의존성 주입(DI)

| 대상 | 규칙 | 예시 |
|---|---|---|
| **외부 소스 클라이언트** | **추상 클래스를 DI 토큰**으로 두고 `useClass`로 구현 바인딩 | `SpotifyMusicClient` ← `SpotifyMusicClientImpl`, `GoogleOAuth2Client` ← `...Impl` |
| **도메인 내부 서비스 / 인프라** | **클래스 직접 주입** (별도 토큰 없음) | `PrismaService`, `JwtService`, `S3Service`, `NotificationService` |

이유: 외부 소스는 E2E에서 `overrideProvider`로 mock 교체가 필요하므로 추상 토큰으로 경계를 만든다.
내부 서비스/인프라는 교체 지점이 아니므로 직접 주입으로 단순하게 둔다.

```ts
// music-source.module.ts — 외부 소스: 추상 토큰 바인딩
providers: [{ provide: SpotifyMusicClient, useClass: SpotifyMusicClientImpl }]

// comment.service.ts — 내부 서비스: 직접 주입
constructor(private readonly prisma: PrismaService,
            private readonly notificationService: NotificationService) {}
```

---

## 3. 예외 처리

### 베이스 계층 (`src/common/exceptions/business.exception.ts`)

- 모든 도메인 예외는 `BusinessException`(→ `HttpException`)을 상속한다.
- 의미별 베이스: `NotFoundException(404)`, `AlreadyExistsException(409)`, `InvalidRequestException(400)`, `UnauthorizedException(401)`, `ForbiddenException(403)`.
- 응답 본문은 전역 필터가 `{ statusCode, code, message, timestamp, path }`로 직렬화한다.

### 에러 코드

- **`SCREAMING_SNAKE_CASE`** 안정 코드(클라이언트 분기용). 예: `USER_NOT_FOUND`, `SONG_NOT_FOUND`.
- **같은 에러 코드는 메시지 표기도 동일해야 한다.** (과거 `DROPPING_NOT_FOUND`가 "드롭/드랍/드랍핑"으로 갈렸음 → 통일.)
- 한글 도메인 표기 표준:
  - dropping → **"드랍"**
  - playlist → **"플레이리스트"**
  - song → **"곡"**
  - user → **"사용자"**

### 공통 vs 도메인 예외

- **여러 도메인이 교차 참조하는 NotFound 예외는 `src/common/exceptions/`에 단일 정의**하고 재사용한다.
  대상: `SongNotFoundException`, `DroppingNotFoundException`, `PlaylistNotFoundException`, `UserNotFoundException`.
- 한 도메인 안에서만 의미를 갖는 예외는 `modules/<domain>/exceptions/`에 둔다.

```ts
export class SongNotFoundException extends NotFoundException {
  constructor() {
    super('SONG_NOT_FOUND', '곡을 찾을 수 없습니다.');
  }
}
```

---

## 4. DTO

### 네이밍

- **응답 DTO는 무접미사 `Response`로 통일한다.** (단건) `XxxResponse`, (목록) `XxxListResponse`.
  - ✅ `CommentResponse`, `MusicDroppingResponse`, `NotificationListResponse`
  - ❌ `...ResponseDto` (과거 song/user/auth 계열이 `Dto`를 붙였음 → 무접미사로 정리)
- 요청 DTO는 동작 의미에 맞춰 `XxxRequest` 또는 `XxxDto`. (예: `CreateCommentRequest`, `LoginDto`)

### 작성 규칙

- 모든 필드에 `@ApiProperty(...)`(필요 시 `nullable`/`type` 명시).
- 요청 DTO 검증은 `class-validator` 데코레이터로. (`@IsEmail`, `@IsString`, `@IsNotEmpty`, `@MaxLength` 등)
- 중첩 객체 타입은 `@ApiProperty({ type: XxxDto })`로 Swagger에 노출.

---

## 5. 컨트롤러 / HTTP

- 모든 컨트롤러에 `@ApiTags('<domain>')`, 각 라우트에 `@ApiOperation` + `@ApiOkResponse`/`@ApiCreatedResponse`.
- 라우트 prefix는 **소문자 복수형**(`songs`, `users`, `droppings`…). 전역 prefix `/api/v1`은 `main.ts`에서 적용.
- 인증:
  - 공개 API(`songs`, `health`)는 가드 없음.
  - 인증 필수 API는 `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()`.
  - 특수 케이스는 전용 가드(예: SSE 구독의 `SseJwtAuthGuard`).
- 레이트 리밋이 필요한 공개 엔드포인트는 `@UseGuards(ThrottlerGuard)`(예: `/songs/search`).

### HTTP 상태 코드

| 상황 | 코드 |
|---|---|
| 리소스 생성(POST) | `201 CREATED` |
| 액션/조회성 POST (투표 등, 결과 본문 있음) | `200 OK` |
| **삭제·취소 등 응답 본문이 없으면** | **`204 NO_CONTENT`** |
| 결과값을 본문으로 돌려주면 | `200 OK` |

> 규칙: **본문이 없으면 204, 본문이 있으면 200.** (과거 댓글 삭제만 200이었음 → 본문 없으면 204로 통일.)

---

## 6. Prisma / 데이터

- `PrismaService` 직접 주입. 기본 CRUD 또는 `$transaction` 사용.
- **원자성이 필요한 다중 write는 `$transaction`으로 묶는다.** 동시성 충돌 가능 구간은 Serializable + 재시도(`dropping`의 투표 로직 참고).
- **FK 없이 JSONB/배열로 참조하는 ID**(`playlist.songIds`, `dropping.options`, `dropping.voteData`)는:
  - write 전에 존재 검증(`validateSongsExist` 류)을 수행한다.
  - 참조 대상(`songs` 등)을 임의 삭제하지 않는다 — orphan으로 상세/거리검색이 깨진다.
    `songs`는 외부 소스의 **참조 캐시**이며, 퍼지/리프레시는 참조 무결성을 고려한 별도 관리 작업으로 다룬다.

---

## 7. 매직 넘버 / 상수

- 의미 있는 수치(만료 기한, 거리 반경, 페이지 크기, TTL, 토큰 갱신 여유 등)는 **명명 상수**로 둔다.
  - 모듈 전역 상수 또는 서비스 `private static readonly`.
  - 환경별로 달라질 값은 env(`ConfigService`)로 노출. (예: `SEARCH_RATE_LIMIT`, `SEARCH_RATE_TTL_MS`)

---

## 8. 외부 호출 에러 처리

- 외부 소스 클라이언트(Spotify/YouTube/OAuth2)의 자격증명 미설정·네트워크·업스트림 오류는 **단일 도메인 예외로 통일**한다. (예: `MusicSourceUnavailableException` → 502)
- 부가 기능(알림 발행, YouTube 매칭 등)은 **best-effort**: 실패해도 주 흐름(좋아요/드랍/검색)은 성공시키고 `logger.warn/error`로 남긴다. 의도적 swallow에는 이유 주석을 단다.

---

## 9. 주석 / 언어

- 주석은 **한국어**. 메서드 상단에 원본(Spring) 대응 + 한국어 설명.
- 섹션 구분은 `// ── 섹션명 ──────────────` 형식.
- 의도적 설계 결정(단일 인스턴스 한정, best-effort, FK 미사용 등)은 반드시 이유를 주석으로 남긴다.

---

## 10. 커밋 / 브랜치

- 기능별 브랜치 분리 후 병합(`--no-ff`).
- **한국어 Conventional Commits**: `feat(domain): ...`, `fix(domain): ...`, `chore(...)`, `refactor(...)` 등.
- 워크플로: 병렬 에이전트 구현 → 병렬 리뷰 → 병합 → E2E.
- 비밀값(`.env`)은 커밋 금지. `.env.example`에는 키만, 값은 비운다. `.env.test`는 추적되므로 실제 비밀값을 넣지 않는다(mock 사용).

---

## 부록: 코드 정합성 점검 (문서 기준 대비 현재 이탈)

아래는 위 규칙 확정 시점에 코드가 아직 따르지 못하는 지점이다. 해당 파일을 손볼 때 함께 정리한다.

- **응답 DTO 접미사**: song/user/auth 계열 `...ResponseDto` → 무접미사 `...Response`로 리네임 대상.
- **DELETE 상태코드**: `comment.controller.ts`의 댓글 삭제가 `200` → 본문 없으면 `204`.
- **중복 예외 통합**: `SongNotFoundException`(song/playlist/dropping), `DroppingNotFoundException`(like/comment/dropping), `PlaylistNotFoundException`·`UserNotFoundException`(dropping)을 `src/common/exceptions/`로 단일화 + 메시지 표기 통일("드랍").
- **공통 헬퍼 추출(선택)**: `findXxxOrThrow`/소유권 검증(`userId !== ...`) 반복, `loadSongMap`↔`resolveSongs` 곡 로딩 중복.
