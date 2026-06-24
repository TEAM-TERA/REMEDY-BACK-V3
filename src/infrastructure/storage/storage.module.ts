import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3.service';

/**
 * 스토리지(S3) 모듈. 전역으로 제공해 어느 도메인에서나 S3Service 를 주입받을 수 있게 한다.
 */
@Global()
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class StorageModule {}
