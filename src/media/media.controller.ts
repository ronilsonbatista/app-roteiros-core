import { Controller, Post, Param, UploadedFile, UseInterceptors, UseGuards, ParseFilePipeBuilder, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const MAX_FILE_SIZE = parseInt(process.env.MEDIA_MAX_FILE_SIZE_MB || '5', 10) * 1024 * 1024;
const filePipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
  .addMaxSizeValidator({ maxSize: MAX_FILE_SIZE })
  .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media/upload')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @ApiTags('Media - User')
  @Post('avatar')
  @ApiOperation({ summary: 'Fazer upload do avatar do usuário' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile(filePipe) file: Express.Multer.File,
  ) {
    return this.mediaService.uploadAvatar(user.userId, file);
  }

  @ApiTags('Media - Admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/base-trip/:id/cover')
  @ApiOperation({ summary: 'Fazer upload da capa de uma BaseTrip (Admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadBaseTripCover(
    @Param('id') id: string,
    @UploadedFile(filePipe) file: Express.Multer.File,
  ) {
    return this.mediaService.uploadBaseTripCover(id, file);
  }

  @ApiTags('Media - Admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/base-attraction/:id/image')
  @ApiOperation({ summary: 'Fazer upload da imagem de uma BaseAttraction (Admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadBaseAttractionImage(
    @Param('id') id: string,
    @UploadedFile(filePipe) file: Express.Multer.File,
  ) {
    return this.mediaService.uploadBaseAttractionImage(id, file);
  }

  @ApiTags('Media - Admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/base-restaurant/:id/image')
  @ApiOperation({ summary: 'Fazer upload da imagem de um BaseRestaurant (Admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadBaseRestaurantImage(
    @Param('id') id: string,
    @UploadedFile(filePipe) file: Express.Multer.File,
  ) {
    return this.mediaService.uploadBaseRestaurantImage(id, file);
  }

  @ApiTags('Media - User')
  @Post('trips/:id/cover')
  @ApiOperation({ summary: 'Fazer upload da capa de uma Trip própria' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadTripCover(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile(filePipe) file: Express.Multer.File,
  ) {
    return this.mediaService.uploadTripCover(user.userId, id, file);
  }
}
