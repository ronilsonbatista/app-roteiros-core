import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MediaService } from './media.service';
import type { Response } from 'express';

@ApiTags('Media - Public')
@Controller()
export class MediaPublicController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('media/file/:folder/:filename')
  @ApiOperation({ summary: 'Obter arquivo de mídia por pasta (Público)' })
  async getMediaByFolder(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.pipeMedia(`${folder}/${filename}`, res);
  }

  @Get('media/file/:filename')
  @ApiOperation({ summary: 'Obter arquivo de mídia na raiz (Público)' })
  async getMediaRoot(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.pipeMedia(filename, res);
  }

  @Get('uploads/:folder/:filename')
  @ApiOperation({ summary: 'Compatibilidade de uploads por pasta (Público)' })
  async getUploadsByFolder(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.pipeMedia(`${folder}/${filename}`, res);
  }

  @Get('uploads/:filename')
  @ApiOperation({ summary: 'Compatibilidade de uploads na raiz (Público)' })
  async getUploadsRoot(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.pipeMedia(filename, res);
  }

  private async pipeMedia(key: string, res: Response) {
    try {
      const { stream, contentType, contentLength } =
        await this.mediaService.getFile(key);
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      (stream as any).pipe(res);
    } catch (err: any) {
      if (err instanceof NotFoundException || err.name === 'NoSuchKey') {
        throw new NotFoundException('Arquivo de mídia não encontrado');
      }
      throw err;
    }
  }
}
