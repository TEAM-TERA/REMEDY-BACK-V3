-- 곡(songs) 캐시를 외부 음원 소스(Spotify/YouTube Music) 연동에 맞게 확장.
--   - album            : Spotify album.name 스냅샷(선택)
--   - youtube_video_id : YouTube Music 매칭 트랙 id(없으면 미지원/미확인)
--   - youtube_checked  : YT 매칭 resolve 시도 여부(재조회 방지)
-- songs.id 는 기존부터 TEXT(앱 레벨 생성)라 DB default 가 없어 PK 변경 SQL 불필요.
ALTER TABLE "songs"
  ADD COLUMN "album" TEXT,
  ADD COLUMN "youtube_video_id" TEXT,
  ADD COLUMN "youtube_checked" BOOLEAN NOT NULL DEFAULT false;
