import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DroppingService } from '../dropping/dropping.service';
import { DroppingSearchListResponse } from '../dropping/dto/dropping-response.dto';
import { LikeService } from '../like/like.service';
import { LikeDroppingListResponse } from '../like/dto/like-response.dto';
import {
  UserProfileImageResponse,
  UserProfileResponse,
  UserProfileUpdateDto,
} from './dto/user-profile.dto';
import { UserService } from './user.service';

/** 프로필 이미지 업로드 최대 5MB */
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly droppingService: DroppingService,
    private readonly likeService: LikeService,
  ) {}

  @Get()
  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiOkResponse({ type: UserProfileResponse })
  getMyProfile(@CurrentUser() user: AuthUser): UserProfileResponse {
    return this.userService.getMyProfile(user);
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '프로필 수정' })
  updateProfile(
    @Body() dto: UserProfileUpdateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.userService.updateProfile(dto, user);
  }

  @Put('profile-image')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '프로필 이미지 업로드' })
  @ApiOkResponse({ type: UserProfileImageResponse })
  @UseInterceptors(FileInterceptor('image'))
  updateProfileImage(
    @UploadedFile(
      new ParseFilePipe({
        // 필수 + 5MB 이하 + 이미지 MIME 화이트리스트
        validators: [
          new MaxFileSizeValidator({ maxSize: PROFILE_IMAGE_MAX_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpe?g|png|webp|gif)$/ }),
        ],
      }),
    )
    image: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<UserProfileImageResponse> {
    return this.userService.updateProfileImage(image, user);
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '회원 탈퇴' })
  withdraw(@CurrentUser() user: AuthUser): Promise<void> {
    return this.userService.withdraw(user);
  }

  @Get('my-drop')
  @ApiOperation({ summary: '내가 드랍한 목록 조회' })
  @ApiOkResponse({ type: DroppingSearchListResponse })
  getMyDroppings(
    @CurrentUser() user: AuthUser,
  ): Promise<DroppingSearchListResponse> {
    return this.droppingService.getUserDroppings(user.id);
  }

  @Get('my-like')
  @ApiOperation({ summary: '내가 좋아요한 드랍 목록 조회' })
  @ApiOkResponse({ type: LikeDroppingListResponse })
  getLikedDroppings(
    @CurrentUser() user: AuthUser,
  ): Promise<LikeDroppingListResponse> {
    return this.likeService.getLikeDroppingsDetailByUser(user.id);
  }
}
