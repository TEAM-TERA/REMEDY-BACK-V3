import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsOptional, MaxLength } from 'class-validator';

/** 원본 UserProfileResponse 이식 */
export class UserProfileResponse {
  @ApiProperty()
  username!: string;

  @ApiProperty()
  profileImageUrl!: string;

  @ApiProperty({ nullable: true })
  gender!: boolean | null;

  @ApiProperty({ nullable: true, type: String, format: 'date' })
  birth!: Date | null;
}

/** 원본 UserProfileUpdateRequest 이식 */
export class UserProfileUpdateDto {
  @ApiProperty({ required: false, maxLength: 15 })
  @IsOptional()
  @MaxLength(15, { message: '닉네임은 최대 15자 이하여야 합니다.' })
  username?: string;

  @ApiProperty({ required: false, description: 'true: 남성, false: 여성' })
  @IsOptional()
  @IsBoolean()
  gender?: boolean;

  @ApiProperty({ required: false, type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;
}

/** 원본 UserProfileImageResponse 이식 */
export class UserProfileImageResponse {
  @ApiProperty()
  profileImageUrl!: string;
}
