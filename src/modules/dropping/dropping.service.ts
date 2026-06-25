import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DroppingType, Prisma, Song } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { SongService } from '../song/song.service';
import { buildPlayLinks } from '../music-source/play-links';
import { DroppingCreateRequest } from './dto/dropping-create.request';
import {
  DroppingResponse,
  DroppingSearchListResponse,
  MusicDroppingResponse,
  MusicDroppingSearchResponse,
  PlaylistDroppingResponse,
  PlaylistDroppingSearchResponse,
  PlaylistSongInfo,
  VoteDroppingResponse,
  VoteDroppingSearchResponse,
  VoteOptionInfo,
} from './dto/dropping-response.dto';
import { MusicPayload, PlaylistPayload, VotePayload } from './dropping.payload';
import {
  DroppingAlreadyExistsException,
  EmptyPlaylistSongsException,
  EmptyVoteOptionsException,
  InvalidDroppingDeleteRequestException,
  InvalidDroppingTypeException,
  InvalidVoteOptionException,
  UnauthorizedPlaylistAccessException,
} from './exceptions/dropping.exceptions';
import {
  DroppingNotFoundException,
  PlaylistNotFoundException,
  SongNotFoundException,
  UserNotFoundException,
} from '../../common/exceptions/not-found.exception';
import { orThrow, assertOwnership } from '../../common/utils/guard';
import { toInputJson } from '../../common/utils/prisma-json';

/**
 * dropping 도메인 서비스 (원본 DroppingServiceFacade + DroppingService +
 * Music/Vote/PlaylistDroppingService + DroppingRepositoryImpl 통합 이식).
 *
 * 원본은 Facade + 타입별 서브서비스로 분리되어 있으나, NestJS 관용상 단일 서비스 안에서
 * 타입별 private 헬퍼(전략)로 처리한다. PostGIS 거리연산은 location(Unsupported) 컬럼을
 * Prisma 모델로 직접 다룰 수 없으므로 전부 $queryRaw/$executeRaw 로 수행한다.
 *
 * Song/Playlist/User 는 별도 모듈 import 없이 PrismaService 로 직접 조회한다.
 */
@Injectable()
export class DroppingService {
  private readonly logger = new Logger(DroppingService.name);

  /** 1m 중복 방지 반경(m). 원본 0.001km = 1m */
  private static readonly DROPPING_CONSTRAINT_DISTANCE_METERS = 1;

  /** Serializable 트랜잭션 직렬화 충돌(P2034) 시 최대 재시도 횟수 */
  private static readonly SERIALIZABLE_MAX_ATTEMPTS = 3;

  /** dropping 만료 기간(일). 원본과 동일하게 생성 시점 now + 3일 */
  private static readonly DROPPING_EXPIRY_DAYS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly songService: SongService,
  ) {}

  /**
   * Serializable 격리 트랜잭션을 직렬화 실패(P2034) 시 재시도하며 실행한다.
   * 동시 요청이 1m 중복검사/투표 read-modify-write 에서 충돌하면 Postgres 가
   * serialization_failure 를 던지는데, 이를 그대로 500 으로 흘리지 않고 재시도한다.
   */
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < DroppingService.SERIALIZABLE_MAX_ATTEMPTS
        ) {
          this.logger.warn(
            `직렬화 충돌(P2034) 재시도 ${attempt}/${DroppingService.SERIALIZABLE_MAX_ATTEMPTS}`,
          );
          continue;
        }
        throw error;
      }
    }
  }

  // ── 생성 ────────────────────────────────────────────────────

  /** dropping 생성 (원본 Facade.createDropping → 타입별 서브서비스 분기) */
  async createDropping(
    userId: number,
    request: DroppingCreateRequest,
  ): Promise<void> {
    switch (request.type) {
      case DroppingType.MUSIC:
        return this.createMusicDropping(userId, request);
      case DroppingType.VOTE:
        return this.createVoteDropping(userId, request);
      case DroppingType.PLAYLIST:
        return this.createPlaylistDropping(userId, request);
      default:
        throw new InvalidDroppingTypeException();
    }
  }

  /** MUSIC 생성 (원본 MusicDroppingService.createDropping) */
  private async createMusicDropping(
    userId: number,
    request: DroppingCreateRequest,
  ): Promise<void> {
    // 곡을 Spotify 에서 fetch+캐시(없으면 SONG_NOT_FOUND) — YouTube 매칭도 이때 1회 resolve
    await this.songService.ensureSongs([request.songId!]);

    const payload: MusicPayload = { songId: request.songId! };
    const droppingId = await this.insertDropping(
      userId,
      request,
      DroppingType.MUSIC,
      payload,
    );

    // 원본 DroppingCreatedEvent: 드롭 생성자 본인에게 알림 발행(best-effort)
    try {
      await this.notificationService.notifyDropping({
        recipientId: userId,
        droppingId,
        songId: payload.songId,
      });
    } catch (error) {
      this.logger.error(
        `드롭 생성 알림 발행 실패 - droppingId=${droppingId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** VOTE 생성 (원본 VoteDroppingService.createVoteDropping + Mapper.toVoteDroppingPayload) */
  private async createVoteDropping(
    userId: number,
    request: DroppingCreateRequest,
  ): Promise<void> {
    // 모든 옵션 곡을 Spotify 에서 fetch+캐시(없으면 SongNotFound). 상세/검색 응답 무결성 보장.
    await this.songService.ensureSongs(request.options!);

    const optionVotes: Record<string, number[]> = {};
    for (const songId of request.options!) {
      optionVotes[songId] = [];
    }
    const payload: VotePayload = { topic: request.topic!, optionVotes };
    await this.insertDropping(userId, request, DroppingType.VOTE, payload);
  }

  /** PLAYLIST 생성 (원본 PlaylistDroppingService.createPlaylistDropping) */
  private async createPlaylistDropping(
    userId: number,
    request: DroppingCreateRequest,
  ): Promise<void> {
    let payload: PlaylistPayload;

    if (request.playlistId && request.playlistId.trim().length > 0) {
      const playlist = await this.prisma.playlist.findUnique({
        where: { id: request.playlistId },
      });
      if (!playlist) {
        throw new PlaylistNotFoundException();
      }
      if (playlist.userId !== userId) {
        throw new UnauthorizedPlaylistAccessException();
      }
      payload = { playlistName: playlist.name, songIds: playlist.songIds };
    } else {
      payload = {
        playlistName: request.playlistName!,
        songIds: request.songIds!,
      };
    }

    // 플레이리스트의 모든 곡을 Spotify 에서 fetch+캐시(없으면 SongNotFound)
    await this.songService.ensureSongs(payload.songIds);

    await this.insertDropping(userId, request, DroppingType.PLAYLIST, payload);
  }

  /**
   * 공통 insert (원본 DroppingRepositoryImpl.createDropping).
   * 1m 중복 방지: 신규 좌표 반경 1m 내 활성(미삭제 & 미만료) dropping 이 있으면 충돌.
   * 검사+삽입을 Serializable 트랜잭션으로 묶어 동시 요청의 1m 제약 우회를 차단한다.
   * location 은 DB 트리거가 lat/lng 로부터 자동 채우므로 INSERT 컬럼에 포함하지 않는다.
   * expiryDate 는 원본과 동일하게 now + 3일.
   */
  private async insertDropping(
    userId: number,
    request: DroppingCreateRequest,
    type: DroppingType,
    payload: MusicPayload | VotePayload | PlaylistPayload,
  ): Promise<string> {
    const expiryDate = new Date(
      Date.now() + DroppingService.DROPPING_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.runSerializable(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id
          FROM droppings
          WHERE is_deleted = false
            AND expiry_date > now()
            AND ST_DWithin(
              location,
              ST_SetSRID(ST_MakePoint(${request.longitude}, ${request.latitude}), 4326)::geography,
              ${DroppingService.DROPPING_CONSTRAINT_DISTANCE_METERS}
            )
          LIMIT 1
        `);
      if (rows.length > 0) {
        throw new DroppingAlreadyExistsException();
      }

      const created = await tx.dropping.create({
        data: {
          droppingType: type,
          payload: toInputJson(payload),
          userId,
          content: request.content ?? null,
          latitude: request.latitude,
          longitude: request.longitude,
          address: request.address,
          expiryDate,
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  // ── 거리기반 검색 ────────────────────────────────────────────

  /**
   * 거리기반 검색 (원본 DroppingService.searchDroppings).
   * distance 는 km 단위(원본 Metrics.KILOMETERS) → meters = distance * 1000.
   * 활성(미삭제 & 미만료) dropping 중 반경 내를 거리 오름차순으로 정렬해 반환한다.
   */
  async searchDroppings(
    userId: number,
    longitude: number,
    latitude: number,
    distanceKm: number,
  ): Promise<DroppingSearchListResponse> {
    const meters = distanceKm * 1000;

    const rows = await this.prisma.$queryRaw<DroppingRow[]>(Prisma.sql`
      SELECT
        id,
        dropping_type    AS "droppingType",
        payload,
        user_id          AS "userId",
        content,
        latitude,
        longitude,
        address,
        expiry_date      AS "expiryDate",
        created_at       AS "createdAt"
      FROM droppings
      WHERE is_deleted = false
        AND expiry_date > now()
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${meters}
        )
      ORDER BY ST_Distance(
        location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) ASC
    `);

    return { droppings: await this.toSearchResponses(rows, userId) };
  }

  /**
   * 내 dropping 목록 (원본 DroppingService.getUserDroppings, createdAt desc).
   * 원본은 findByUserId 만 수행해 삭제/만료분도 포함하므로(내 보관함 성격),
   * 거리검색과 달리 is_deleted/expiry 필터를 적용하지 않는다(원본 패리티).
   */
  async getUserDroppings(userId: number): Promise<DroppingSearchListResponse> {
    const rows = await this.prisma.$queryRaw<DroppingRow[]>(Prisma.sql`
      SELECT
        id,
        dropping_type    AS "droppingType",
        payload,
        user_id          AS "userId",
        content,
        latitude,
        longitude,
        address,
        expiry_date      AS "expiryDate",
        created_at       AS "createdAt"
      FROM droppings
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `);

    return { droppings: await this.toSearchResponses(rows, userId) };
  }

  /**
   * search/list 결과 일괄 변환 (원본 DroppingService.convertToResponse).
   * 각 행의 대표 곡(music=songId, vote=첫 옵션, playlist=첫 곡)을 한 번의 findMany 로
   * 모아 해석하여 N+1 을 제거한다.
   */
  private async toSearchResponses(
    rows: DroppingRow[],
    userId: number,
  ): Promise<DroppingResponse[]> {
    // 1) 행별 대표 songId 를 한 번만 계산(이중 호출 제거)
    const rowsWithSongId = rows.map((row) => ({
      row,
      songId: this.representativeSongId(row),
    }));
    const songMap = await this.songService.loadSongMap(
      rowsWithSongId.map(({ songId }) => songId),
    );

    // 2) 동기 변환
    return rowsWithSongId.map(({ row, songId }) => {
      const isMyDropping = row.userId === userId;
      const song = songMap.get(songId)!;
      switch (row.droppingType) {
        case DroppingType.MUSIC:
          return this.toMusicSearchResponse(row, song, isMyDropping);
        case DroppingType.VOTE:
          return this.toVoteSearchResponse(row, song, isMyDropping);
        case DroppingType.PLAYLIST:
          return this.toPlaylistSearchResponse(row, song, isMyDropping);
        default:
          throw new InvalidDroppingTypeException();
      }
    });
  }

  /** 행의 대표 곡 id (검색 응답의 앨범 이미지에 쓰임) */
  private representativeSongId(row: DroppingRow): string {
    switch (row.droppingType) {
      case DroppingType.MUSIC:
        return this.parseMusicPayload(row.payload).songId;
      case DroppingType.VOTE: {
        const firstSongId = Object.keys(
          this.parseVotePayload(row.payload).optionVotes,
        )[0];
        if (firstSongId === undefined) {
          throw new EmptyVoteOptionsException();
        }
        return firstSongId;
      }
      case DroppingType.PLAYLIST: {
        const firstSongId = this.parsePlaylistPayload(row.payload).songIds[0];
        if (firstSongId === undefined) {
          throw new EmptyPlaylistSongsException();
        }
        return firstSongId;
      }
      default:
        throw new InvalidDroppingTypeException();
    }
  }

  private toMusicSearchResponse(
    row: DroppingRow,
    song: Song,
    isMyDropping: boolean,
  ): MusicDroppingSearchResponse {
    const payload = this.parseMusicPayload(row.payload);
    return {
      type: DroppingType.MUSIC,
      droppingId: row.id,
      userId: row.userId,
      songId: payload.songId,
      title: song.title,
      artist: song.artist,
      content: row.content,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      albumImageUrl: song.albumImagePath,
      isMyDropping,
    };
  }

  private toVoteSearchResponse(
    row: DroppingRow,
    firstSong: Song,
    isMyDropping: boolean,
  ): VoteDroppingSearchResponse {
    const payload = this.parseVotePayload(row.payload);
    return {
      type: DroppingType.VOTE,
      droppingId: row.id,
      userId: row.userId,
      topic: payload.topic,
      options: Object.keys(payload.optionVotes),
      content: row.content,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      firstAlbumImageUrl: firstSong.albumImagePath,
      isMyDropping,
    };
  }

  private toPlaylistSearchResponse(
    row: DroppingRow,
    firstSong: Song,
    isMyDropping: boolean,
  ): PlaylistDroppingSearchResponse {
    const payload = this.parsePlaylistPayload(row.payload);
    return {
      type: DroppingType.PLAYLIST,
      droppingId: row.id,
      userId: row.userId,
      playlistName: payload.playlistName,
      songIds: payload.songIds,
      content: row.content,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      firstAlbumImageUrl: firstSong.albumImagePath,
      isMyDropping,
    };
  }

  // ── 단건 상세 ────────────────────────────────────────────────

  /** 단건 조회 (원본 Facade.getDropping → 타입별 상세) */
  async getDropping(
    droppingId: string,
    userId: number,
  ): Promise<
    MusicDroppingResponse | VoteDroppingResponse | PlaylistDroppingResponse
  > {
    const dropping = await this.findDroppingOrThrow(droppingId);

    switch (dropping.droppingType) {
      case DroppingType.MUSIC:
        return this.getMusicDropping(dropping);
      case DroppingType.VOTE:
        return this.getVoteDropping(dropping, userId);
      case DroppingType.PLAYLIST:
        return this.getPlaylistDropping(dropping);
      default:
        throw new InvalidDroppingTypeException();
    }
  }

  /** MUSIC 상세 (원본 MusicDroppingService.getMusicDropping) */
  private async getMusicDropping(
    dropping: DroppingRecord,
  ): Promise<MusicDroppingResponse> {
    const payload = this.parseMusicPayload(dropping.payload);
    const [user, song] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dropping.userId } }),
      this.findSongOrThrow(payload.songId),
    ]);
    if (!user) {
      throw new UserNotFoundException();
    }

    return {
      droppingId: dropping.id,
      songId: payload.songId,
      userId: dropping.userId,
      username: user.username,
      content: dropping.content,
      expiryDate: dropping.expiryDate,
      createdAt: dropping.createdAt,
      albumImageUrl: song.albumImagePath,
      playLinks: buildPlayLinks(song),
    };
  }

  /** VOTE 상세 (원본 VoteDroppingService.getVoteDropping + VoteCalculator) */
  private async getVoteDropping(
    dropping: DroppingRecord,
    userId: number,
  ): Promise<VoteDroppingResponse> {
    const payload = this.parseVotePayload(dropping.payload);
    const songMap = await this.songService.loadSongMap(
      Object.keys(payload.optionVotes),
    );

    // optionVotes 삽입순(Object.entries)을 그대로 유지하며 단일 패스로
    // 옵션 목록·총 투표수·내가 투표한 옵션을 함께 누적한다.
    const options: VoteOptionInfo[] = [];
    let totalVotes = 0;
    let userVotedOption: string | null = null;

    for (const [songId, voters] of Object.entries(payload.optionVotes)) {
      options.push(this.toVoteOptionInfo(songId, voters, songMap));
      totalVotes += voters.length;
      // 같은 유저가 여러 옵션에 있으면 마지막 옵션이 채택됨(원본 동작 보존).
      if (voters.includes(userId)) {
        userVotedOption = songId;
      }
    }

    return {
      droppingId: dropping.id,
      userId: dropping.userId,
      topic: payload.topic,
      options,
      content: dropping.content,
      latitude: dropping.latitude,
      longitude: dropping.longitude,
      address: dropping.address,
      expiryDate: dropping.expiryDate,
      createdAt: dropping.createdAt,
      totalVotes,
      userVotedOption,
    };
  }

  /** VOTE 옵션 1건의 응답 정보 구성(투표수는 voters 길이). songMap 은 옵션 존재 보장. */
  private toVoteOptionInfo(
    songId: string,
    voters: number[],
    songMap: Map<string, Song>,
  ): VoteOptionInfo {
    const song = songMap.get(songId)!;
    return {
      songId,
      albumImagePath: song.albumImagePath,
      title: song.title,
      artist: song.artist,
      voteCount: voters.length,
      playLinks: buildPlayLinks(song),
    };
  }

  /** PLAYLIST 상세 (원본 PlaylistDroppingService.getPlaylistDropping) */
  private async getPlaylistDropping(
    dropping: DroppingRecord,
  ): Promise<PlaylistDroppingResponse> {
    const payload = this.parsePlaylistPayload(dropping.payload);
    const songMap = await this.songService.loadSongMap(payload.songIds);

    const songs: PlaylistSongInfo[] = payload.songIds.map((songId) => {
      const song = songMap.get(songId)!;
      return {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        albumImagePath: song.albumImagePath,
        playLinks: buildPlayLinks(song),
      };
    });

    return {
      droppingId: dropping.id,
      userId: dropping.userId,
      playlistName: payload.playlistName,
      songs,
      content: dropping.content,
      latitude: dropping.latitude,
      longitude: dropping.longitude,
      address: dropping.address,
      expiryDate: dropping.expiryDate,
      createdAt: dropping.createdAt,
    };
  }

  // ── 삭제 ────────────────────────────────────────────────────

  /** soft delete (원본 DroppingService.deleteDropping, 소유자 검증) */
  async deleteDropping(droppingId: string, userId: number): Promise<void> {
    const dropping = await this.findDroppingOrThrow(droppingId);
    assertOwnership(
      dropping.userId,
      userId,
      () => new InvalidDroppingDeleteRequestException(),
    );
    await this.prisma.dropping.update({
      where: { id: droppingId },
      data: { isDeleted: true },
    });
  }

  // ── 투표 ────────────────────────────────────────────────────

  /**
   * 투표 (원본 VoteDroppingService.vote + VoteDroppingPayload.addVote).
   * optionVotes 에서 해당 유저를 모든 옵션에서 제거 후 songId 옵션에 추가.
   * 존재하지 않는 옵션이면 InvalidVoteOptionException.
   * 조회→수정→저장을 Serializable 트랜잭션으로 묶어 동시 투표의 lost update 를 방지한다.
   */
  async vote(
    droppingId: string,
    userId: number,
    songId: string,
  ): Promise<void> {
    await this.runSerializable(async (tx) => {
      const payload = await this.loadVotePayloadForUpdate(tx, droppingId);

      if (!Object.prototype.hasOwnProperty.call(payload.optionVotes, songId)) {
        throw new InvalidVoteOptionException();
      }

      // 모든 옵션에서 유저 제거 후 선택 옵션에 추가
      for (const key of Object.keys(payload.optionVotes)) {
        payload.optionVotes[key] = payload.optionVotes[key].filter(
          (id) => id !== userId,
        );
      }
      payload.optionVotes[songId].push(userId);

      await tx.dropping.update({
        where: { id: droppingId },
        data: { payload: toInputJson(payload) },
      });
    });
  }

  /** 투표 취소 (원본 VoteDroppingService.cancelVote + removeVote) */
  async cancelVote(droppingId: string, userId: number): Promise<void> {
    await this.runSerializable(async (tx) => {
      const payload = await this.loadVotePayloadForUpdate(tx, droppingId);

      for (const key of Object.keys(payload.optionVotes)) {
        payload.optionVotes[key] = payload.optionVotes[key].filter(
          (id) => id !== userId,
        );
      }

      await tx.dropping.update({
        where: { id: droppingId },
        data: { payload: toInputJson(payload) },
      });
    });
  }

  /** 트랜잭션 내에서 VOTE dropping 의 payload 를 로드 + 타입 검증 */
  private async loadVotePayloadForUpdate(
    tx: Prisma.TransactionClient,
    droppingId: string,
  ): Promise<VotePayload> {
    const dropping = await tx.dropping.findUnique({
      where: { id: droppingId },
    });
    if (!dropping) {
      throw new DroppingNotFoundException();
    }
    // 삭제(soft-delete)되었거나 만료된 드롭은 투표를 받지 않는다(검색 결과와 일관).
    if (dropping.isDeleted || dropping.expiryDate <= new Date()) {
      throw new DroppingNotFoundException();
    }
    if (dropping.droppingType !== DroppingType.VOTE) {
      throw new InvalidDroppingTypeException();
    }
    return this.parseVotePayload(dropping.payload);
  }

  // ── 만료 정리(cron) ──────────────────────────────────────────

  /**
   * 만료된 dropping 자동 soft delete (원본 @Scheduled(cron="0 * * * * *") → 매분 실행).
   * expiry_date < now() AND is_deleted = false 인 행을 일괄 soft delete.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredDroppings(): Promise<void> {
    const result = await this.prisma.dropping.updateMany({
      where: { isDeleted: false, expiryDate: { lt: new Date() } },
      data: { isDeleted: true },
    });

    if (result.count > 0) {
      this.logger.log(
        `만료된 Dropping ${result.count}개 자동 soft delete 완료`,
      );
    }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────

  /** dropping 조회 후 없으면 예외 (원본 getDroppingEntity / findById.orElseThrow) */
  private async findDroppingOrThrow(
    droppingId: string,
  ): Promise<DroppingRecord> {
    return orThrow(
      await this.prisma.dropping.findUnique({ where: { id: droppingId } }),
      () => new DroppingNotFoundException(),
    );
  }

  /** 곡 단건 조회 후 없으면 예외 */
  private async findSongOrThrow(songId: string): Promise<Song> {
    return orThrow(
      await this.prisma.song.findUnique({ where: { id: songId } }),
      () => new SongNotFoundException(),
    );
  }

  // ── payload 런타임 가드 (JSONB → 타입, 불일치 시 InvalidDroppingType) ──

  private parseMusicPayload(payload: unknown): MusicPayload {
    if (this.isRecord(payload) && typeof payload.songId === 'string') {
      return payload as unknown as MusicPayload;
    }
    throw new InvalidDroppingTypeException();
  }

  private parseVotePayload(payload: unknown): VotePayload {
    if (
      this.isRecord(payload) &&
      typeof payload.topic === 'string' &&
      this.isRecord(payload.optionVotes)
    ) {
      return payload as unknown as VotePayload;
    }
    throw new InvalidDroppingTypeException();
  }

  private parsePlaylistPayload(payload: unknown): PlaylistPayload {
    if (
      this.isRecord(payload) &&
      typeof payload.playlistName === 'string' &&
      Array.isArray(payload.songIds)
    ) {
      return payload as unknown as PlaylistPayload;
    }
    throw new InvalidDroppingTypeException();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

/**
 * $queryRaw 거리검색 결과 행 타입.
 * payload 는 JSONB → Prisma 가 객체로 반환한다.
 */
interface DroppingRow {
  id: string;
  droppingType: DroppingType;
  payload: unknown;
  userId: number;
  content: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  expiryDate: Date;
  createdAt: Date;
}

/** prisma.dropping.findUnique 반환 타입(payload 포함). location 은 select 하지 않는다. */
interface DroppingRecord {
  id: string;
  droppingType: DroppingType;
  payload: unknown;
  userId: number;
  content: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  expiryDate: Date;
  createdAt: Date;
  isDeleted: boolean;
}
