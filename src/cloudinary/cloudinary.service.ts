import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  UploadApiResponse,
  UploadApiErrorResponse,
  v2 as Cloudinary,
} from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject('CLOUDINARY') private readonly cloudinary: typeof Cloudinary,
  ) {}

  async uploadFileFromBuffer(
    buffer: Buffer,
    folderName: string,
    fileName?: string,
    resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadOptions: any = {
        folder: folderName,
        resource_type: resourceType,
      };

      if (fileName) {
        uploadOptions.public_id = fileName.split('.')[0];
      }

      const stream = this.cloudinary.uploader.upload_stream(
        uploadOptions,
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error) {
            return reject(
              new InternalServerErrorException(
                `Cloudinary upload error: ${error.message}`,
              ),
            );
          }
          if (!result) {
            return reject(
              new InternalServerErrorException(
                'Cloudinary upload returned empty response',
              ),
            );
          }
          resolve(result);
        },
      );
      stream.end(buffer);
    });
  }

  // Alias for backward compatibility
  async uploadImageFromBuffer(
    buffer: Buffer,
    folderName: string,
    fileName?: string,
  ): Promise<UploadApiResponse> {
    return this.uploadFileFromBuffer(buffer, folderName, fileName, 'auto');
  }
}
