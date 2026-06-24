import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DroppingType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * 타입별 cross-field 검증기 (원본 DroppingTypeValidator @ValidDroppingType 이식).
 * - MUSIC: songId 필수, topic/options/playlistId/playlistName/songIds 금지
 * - VOTE: topic 필수, options 2~5개, songId/playlistId/playlistName/songIds 금지
 * - PLAYLIST: playlistId XOR (playlistName + songIds(1~50)), songId/topic/options 금지
 *
 * 원본은 위반 필드별 메시지를 모두 수집하나, 여기서는 단일 메시지로 충분(요청 거부 동작 동등).
 */
@ValidatorConstraint({ name: 'ValidDroppingType', async: false })
class DroppingTypeConstraint implements ValidatorConstraintInterface {
  private message = '유효하지 않은 드랍 요청입니다.';

  validate(_value: unknown, args: ValidationArguments): boolean {
    const req = args.object as DroppingCreateRequest;
    if (req.type == null) return true; // @IsEnum 이 별도로 잡는다

    switch (req.type) {
      case DroppingType.MUSIC:
        return this.validateMusic(req);
      case DroppingType.VOTE:
        return this.validateVote(req);
      case DroppingType.PLAYLIST:
        return this.validatePlaylist(req);
      default:
        this.message = '유효하지 않은 드랍 타입입니다.';
        return false;
    }
  }

  defaultMessage(): string {
    return this.message;
  }

  private fail(msg: string): boolean {
    this.message = msg;
    return false;
  }

  private isBlank(s: string | null | undefined): boolean {
    return s == null || s.trim().length === 0;
  }

  private notEmptyArray(a: unknown[] | null | undefined): boolean {
    return a != null && a.length > 0;
  }

  private validateMusic(req: DroppingCreateRequest): boolean {
    if (this.isBlank(req.songId))
      return this.fail('MUSIC 타입은 songId가 필수입니다');
    if (req.topic != null)
      return this.fail('MUSIC 타입에는 topic을 포함할 수 없습니다');
    if (this.notEmptyArray(req.options))
      return this.fail('MUSIC 타입에는 options를 포함할 수 없습니다');
    if (req.playlistId != null)
      return this.fail('MUSIC 타입에는 playlistId를 포함할 수 없습니다');
    if (req.playlistName != null)
      return this.fail('MUSIC 타입에는 playlistName을 포함할 수 없습니다');
    if (this.notEmptyArray(req.songIds))
      return this.fail('MUSIC 타입에는 songIds를 포함할 수 없습니다');
    return true;
  }

  private validateVote(req: DroppingCreateRequest): boolean {
    if (this.isBlank(req.topic))
      return this.fail('VOTE 타입은 topic이 필수입니다');
    if (!this.notEmptyArray(req.options))
      return this.fail('VOTE 타입은 options가 필수입니다 (최소 2개)');
    if (req.options!.length < 2 || req.options!.length > 5)
      return this.fail('VOTE 타입의 options는 2~5개여야 합니다');
    if (req.songId != null)
      return this.fail('VOTE 타입에는 songId를 포함할 수 없습니다');
    if (req.playlistId != null)
      return this.fail('VOTE 타입에는 playlistId를 포함할 수 없습니다');
    if (req.playlistName != null)
      return this.fail('VOTE 타입에는 playlistName을 포함할 수 없습니다');
    if (this.notEmptyArray(req.songIds))
      return this.fail('VOTE 타입에는 songIds를 포함할 수 없습니다');
    return true;
  }

  private validatePlaylist(req: DroppingCreateRequest): boolean {
    const hasPlaylistId = !this.isBlank(req.playlistId);
    const hasNewPlaylist =
      !this.isBlank(req.playlistName) || this.notEmptyArray(req.songIds);

    if (!hasPlaylistId && !hasNewPlaylist)
      return this.fail(
        'PLAYLIST 타입은 playlistId 또는 (playlistName + songIds)가 필수입니다',
      );
    if (hasPlaylistId && hasNewPlaylist)
      return this.fail(
        'PLAYLIST 타입은 playlistId와 (playlistName + songIds)를 동시에 사용할 수 없습니다',
      );

    if (!hasPlaylistId && hasNewPlaylist) {
      if (this.isBlank(req.playlistName))
        return this.fail('새 플레이리스트 생성 시 playlistName이 필수입니다');
      if (!this.notEmptyArray(req.songIds))
        return this.fail(
          '새 플레이리스트 생성 시 songIds가 필수입니다 (최소 1개)',
        );
      if (req.songIds!.length > 50)
        return this.fail('PLAYLIST 타입의 songIds는 최대 50개까지 가능합니다');
    }

    if (req.songId != null)
      return this.fail('PLAYLIST 타입에는 songId를 포함할 수 없습니다');
    if (req.topic != null)
      return this.fail('PLAYLIST 타입에는 topic을 포함할 수 없습니다');
    if (this.notEmptyArray(req.options))
      return this.fail('PLAYLIST 타입에는 options를 포함할 수 없습니다');
    return true;
  }
}

/** 원본 DroppingCreateRequest 이식 (타입별 payload 필드 + 위치 정보) */
export class DroppingCreateRequest {
  @ApiProperty({ enum: DroppingType, description: '드랍 타입' })
  @IsNotEmpty({ message: '드랍 타입은 필수입니다' })
  @IsEnum(DroppingType, { message: '유효하지 않은 드랍 타입입니다' })
  @Validate(DroppingTypeConstraint)
  type!: DroppingType;

  // MUSIC
  @ApiPropertyOptional({ description: 'MUSIC: 곡 ID' })
  @IsOptional()
  @IsString()
  songId?: string;

  // VOTE
  @ApiPropertyOptional({ description: 'VOTE: 투표 주제' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'VOTE: 옵션 곡 ID 목록 (2~5)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  // PLAYLIST
  @ApiPropertyOptional({ description: 'PLAYLIST: 기존 플레이리스트 ID' })
  @IsOptional()
  @IsString()
  playlistId?: string;

  @ApiPropertyOptional({ description: 'PLAYLIST: 새 플레이리스트 이름' })
  @IsOptional()
  @IsString()
  playlistName?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'PLAYLIST: 새 플레이리스트 곡 ID 목록 (1~50)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  songIds?: string[];

  @ApiPropertyOptional({ description: '내용 (최대 255자)' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '내용은 255자를 초과할 수 없습니다' })
  content?: string;

  @ApiProperty({ description: '위도', minimum: -90, maximum: 90 })
  @IsNotEmpty({ message: '위도는 필수입니다' })
  @IsNumber({}, { message: '위도는 숫자여야 합니다' })
  @Min(-90, { message: '위도는 -90도 이상이어야 합니다' })
  @Max(90, { message: '위도는 90도 이하여야 합니다' })
  latitude!: number;

  @ApiProperty({ description: '경도', minimum: -180, maximum: 180 })
  @IsNotEmpty({ message: '경도는 필수입니다' })
  @IsNumber({}, { message: '경도는 숫자여야 합니다' })
  @Min(-180, { message: '경도는 -180도 이상이어야 합니다' })
  @Max(180, { message: '경도는 180도 이하여야 합니다' })
  longitude!: number;

  @ApiProperty({ description: '주소 (최대 200자)' })
  @IsNotEmpty({ message: '주소는 필수입니다' })
  @IsString()
  @MaxLength(200, { message: '주소는 200자를 초과할 수 없습니다' })
  address!: string;
}
