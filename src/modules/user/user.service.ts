import { Injectable } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  UserProfileImageResponse,
  UserProfileResponse,
  UserProfileUpdateDto,
} from './dto/user-profile.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** 내 프로필 조회 (원본 getMyProfile) */
  getMyProfile(user: AuthUser): UserProfileResponse {
    return {
      username: user.username,
      profileImageUrl: user.profileImage,
      gender: user.gender,
      birth: user.birthDate,
    };
  }

  /** 프로필 수정 — 전달된 필드만 갱신 (원본 updateUserProfile) */
  async updateProfile(
    dto: UserProfileUpdateDto,
    user: AuthUser,
  ): Promise<void> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate;
    if (dto.gender !== undefined) data.gender = dto.gender;

    if (Object.keys(data).length === 0) return;

    await this.prisma.user.update({ where: { id: user.id }, data });
  }

  /** 프로필 이미지 업로드 (원본 updateUserProfileImage) */
  async updateProfileImage(
    image: Express.Multer.File,
    user: AuthUser,
  ): Promise<UserProfileImageResponse> {
    const imageUrl = await this.s3.uploadImage(image, 'profile');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { profileImage: imageUrl },
    });
    return { profileImageUrl: imageUrl };
  }

  /** 회원 탈퇴 (원본 withdrawUser) */
  async withdraw(user: AuthUser): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: Status.WITHDRAWAL, withdrawalDate: new Date() },
    });
  }
}
