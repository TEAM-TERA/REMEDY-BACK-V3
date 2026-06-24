import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsNotEmpty,
  Length,
  MaxDate,
} from 'class-validator';

/** 원본 AuthRegisterRequest 이식 */
export class SignupDto {
  @ApiProperty({ example: 'hyunwoo', minLength: 1, maxLength: 15 })
  @IsNotEmpty({ message: '닉네임 입력은 필수입니다.' })
  @Length(1, 15, {
    message: '닉네임은 최소 1자 이상, 최대 15자 이하여야 합니다.',
  })
  username!: string;

  @ApiProperty({ example: 'super-secret-1', minLength: 8, maxLength: 20 })
  @IsNotEmpty({ message: '비밀번호 입력은 필수입니다.' })
  @Length(8, 20, {
    message: '비밀번호는 최소 8자 이상, 최대 20자 이하여야 합니다.',
  })
  password!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @IsNotEmpty({ message: '이메일 입력은 필수입니다.' })
  email!: string;

  @ApiProperty({ example: '2000-01-01', type: String, format: 'date' })
  @Type(() => Date)
  @IsDate({ message: '생년월일 형식이 올바르지 않습니다.' })
  @MaxDate(() => new Date(), { message: '생년월일은 미래일 수 없습니다.' })
  birthDate!: Date;

  @ApiProperty({ example: true, description: 'true: 남성, false: 여성' })
  @IsBoolean({ message: '성별 입력은 필수 입니다.' })
  gender!: boolean;
}
