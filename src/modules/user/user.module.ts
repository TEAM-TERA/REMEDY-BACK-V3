import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DroppingModule } from '../dropping/dropping.module';
import { LikeModule } from '../like/like.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  // DroppingModule/LikeModule 은 my-drop·my-like 엔드포인트에서 각 서비스를 재사용
  imports: [AuthModule, DroppingModule, LikeModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
