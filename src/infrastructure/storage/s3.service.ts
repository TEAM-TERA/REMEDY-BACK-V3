import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

/**
 * AWS S3 이미지 업로드 (원본 infrastructure/storage/s3 이식).
 * 자격증명(env)이 없으면 부팅은 되지만 업로드 호출 시 명확히 예외를 던진다.
 * E2E에서는 이 서비스를 테스트 더블로 오버라이드한다.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket?: string;
  private readonly region?: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET');
    this.region = this.config.get<string>('AWS_S3_REGION');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_KEY');

    if (this.bucket && this.region && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: this.region,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn(
        'S3 자격증명이 설정되지 않았습니다. 이미지 업로드 호출 시 예외가 발생합니다.',
      );
    }
  }

  /**
   * 이미지를 업로드하고 공개 URL을 반환한다.
   * @param file Multer 파일
   * @param directory 버킷 내 디렉터리 prefix (예: 'profile')
   */
  async uploadImage(
    file: Express.Multer.File,
    directory = 'profile',
  ): Promise<string> {
    if (!this.client || !this.bucket || !this.region) {
      throw new InternalServerErrorException('S3 storage is not configured');
    }

    const ext = this.extractExtension(file.originalname, file.mimetype);
    const key = `${directory}/${randomUUID()}${ext}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      this.logger.error('S3 업로드 실패', error as Error);
      throw new InternalServerErrorException('Failed to upload image');
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private extractExtension(originalName: string, mimetype: string): string {
    const dot = originalName.lastIndexOf('.');
    if (dot !== -1) {
      return originalName.slice(dot);
    }
    const fromMime = mimetype.split('/')[1];
    return fromMime ? `.${fromMime}` : '';
  }
}
