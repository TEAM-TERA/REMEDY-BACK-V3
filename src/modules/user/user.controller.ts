import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  UserProfileImageResponseDto,
  UserProfileResponseDto,
  UserProfileUpdateDto,
} from './dto/user-profile.dto';
import { UserService } from './user.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getMyProfile(@CurrentUser() user: AuthUser): UserProfileResponseDto {
    return this.userService.getMyProfile(user);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
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
  @ApiOkResponse({ type: UserProfileImageResponseDto })
  @UseInterceptors(FileInterceptor('image'))
  updateProfileImage(
    @UploadedFile() image: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<UserProfileImageResponseDto> {
    return this.userService.updateProfileImage(image, user);
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '회원 탈퇴' })
  withdraw(@CurrentUser() user: AuthUser): Promise<void> {
    return this.userService.withdraw(user);
  }
}
