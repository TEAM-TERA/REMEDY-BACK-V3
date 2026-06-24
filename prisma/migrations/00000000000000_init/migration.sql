-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ROLE_USER', 'ROLE_ADMIN');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('JOIN', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "OAuth2Provider" AS ENUM ('GOOGLE', 'KAKAO', 'NAVER', 'LOCAL');

-- CreateEnum
CREATE TYPE "DroppingType" AS ENUM ('MUSIC', 'VOTE', 'PLAYLIST');

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "username" VARCHAR(15) NOT NULL,
    "password" TEXT,
    "profile_image" TEXT NOT NULL DEFAULT 'https://mblogthumb-phinf.pstatic.net/MjAyMDExMDFfODMg/MDAxNjA0MjI4ODc1MDgz.gQ3xcHrLXaZyxcFAoEcdB7tJWuRs7fKgOxQwPvsTsrUg.0OBtKHq2r3smX5guFQtnT7EDwjzksz5Js0wCV4zjfpcg.JPEG.gambasg/%EC%9C%A0%ED%8A%9C%EB%B8%8C_%EA%B8%B0%EB%B3%B8%ED%94%84%EB%A1%9C%ED%95%84_%EB%B3%B4%EB%9D%BC.jpg?type=w400',
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ROLE_USER',
    "birth_date" DATE,
    "gender" BOOLEAN,
    "status" "Status" NOT NULL DEFAULT 'JOIN',
    "withdrawal_date" TIMESTAMP(3),
    "provider" "OAuth2Provider" NOT NULL DEFAULT 'LOCAL',
    "provider_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "dropping_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "dropping_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "album_image_path" TEXT NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "droppings" (
    "id" TEXT NOT NULL,
    "dropping_type" "DroppingType" NOT NULL,
    "payload" JSONB NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "location" geography(Point, 4326),

    CONSTRAINT "droppings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "song_ids" TEXT[],

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_provider_provider_id_idx" ON "users"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "comments_dropping_id_idx" ON "comments"("dropping_id");

-- CreateIndex
CREATE INDEX "likes_dropping_id_idx" ON "likes"("dropping_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_dropping_id_key" ON "likes"("user_id", "dropping_id");

-- CreateIndex
CREATE INDEX "droppings_user_id_idx" ON "droppings"("user_id");

-- CreateIndex
CREATE INDEX "droppings_is_deleted_expiry_date_idx" ON "droppings"("is_deleted", "expiry_date");

-- CreateIndex
CREATE INDEX "playlists_user_id_idx" ON "playlists"("user_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_dropping_id_fkey" FOREIGN KEY ("dropping_id") REFERENCES "droppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_dropping_id_fkey" FOREIGN KEY ("dropping_id") REFERENCES "droppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "droppings" ADD CONSTRAINT "droppings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- PostGIS: droppings.location 자동 채움 (lat/lng → geography Point)
-- 원본 Mongo의 GeoJsonPoint(longitude, latitude)와 동일하게 (경도, 위도) 순서
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_dropping_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_dropping_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON "droppings"
    FOR EACH ROW
    EXECUTE FUNCTION set_dropping_location();

-- 거리기반 검색용 공간 인덱스 (ST_DWithin)
CREATE INDEX "droppings_location_gist_idx" ON "droppings" USING GIST ("location");

-- ─────────────────────────────────────────────────────────────
-- pg_trgm: songs 제목/가수 부분일치 통합검색 (원본 Elasticsearch nori 대체)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX "songs_title_trgm_idx" ON "songs" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "songs_artist_trgm_idx" ON "songs" USING GIN ("artist" gin_trgm_ops);
