import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

/** 원본 PlaylistCreateRequest 이식 */
export class PlaylistCreateRequest {
  @ApiProperty({ example: '내 플레이리스트' })
  @IsNotEmpty({ message: '플레이리스트 이름은 필수입니다.' })
  @IsString()
  name!: string;
}

/** 원본 PlaylistUpdateRequest 이식 */
export class PlaylistUpdateRequest {
  @ApiProperty({ example: '수정된 플레이리스트' })
  @IsNotEmpty({ message: '플레이리스트 이름은 필수입니다.' })
  @IsString()
  name!: string;
}

/** 원본 PlaylistSongAddRequest 이식 */
export class PlaylistSongAddRequest {
  @ApiProperty({ type: [String], example: ['song-id-1', 'song-id-2'] })
  @IsArray()
  @ArrayNotEmpty({ message: '곡 ID 목록은 필수입니다.' })
  @IsString({ each: true })
  songIds!: string[];
}
