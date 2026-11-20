import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ImageBankService } from './image-bank.service';
import { imageBankMaxBytes } from './image-bank.constants';
import {
  AdminListQueryDto,
  CreateCityDto,
  CreateDestinationDto,
  UpdateCityDto,
  UpdateDestinationDto,
  UpdateSpotImageDto,
  UploadSpotImageDto,
} from './dto/image-bank.dto';

@ApiTags('Admin - Image Bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/image-bank')
export class AdminImageBankController {
  constructor(private readonly imageBank: ImageBankService) {}

  @Get('destinations')
  @ApiOperation({
    summary: 'Listar destinos do banco de imagens, inclusive rascunhos',
  })
  listDestinations(@Query() query: AdminListQueryDto) {
    return this.imageBank.listAdminDestinations(query);
  }

  @Post('destinations')
  @ApiOperation({
    summary: 'Criar destino em rascunho',
    description:
      'Nasce DRAFT. Publique com PATCH depois de ter ao menos uma cidade publicada.',
  })
  createDestination(@Body() dto: CreateDestinationDto) {
    return this.imageBank.createDestination(dto);
  }

  @Get('destinations/:id')
  @ApiOperation({
    summary: 'Detalhe do destino com cidades, metadados e URL de leitura',
  })
  getDestination(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imageBank.getAdminDestination(id);
  }

  @Patch('destinations/:id')
  @ApiOperation({
    summary: 'Atualizar destino, inclusive publicar ou despublicar',
  })
  updateDestination(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDestinationDto,
  ) {
    return this.imageBank.updateDestination(id, dto);
  }

  @Delete('destinations/:id')
  @ApiOperation({ summary: 'Apagar destino, cidades e objetos no storage' })
  deleteDestination(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imageBank.deleteDestination(id);
  }

  @Post('destinations/:destinationId/cities')
  @ApiOperation({
    summary: 'Criar cidade em rascunho',
    description:
      'Um destino pode ter várias cidades. O caso comum é uma. A cidade nasce DRAFT e pode ter menos de 5 imagens.',
  })
  createCity(
    @Param('destinationId', new ParseUUIDPipe()) destinationId: string,
    @Body() dto: CreateCityDto,
  ) {
    return this.imageBank.createCity(destinationId, dto);
  }

  @Patch('cities/:id')
  @ApiOperation({
    summary: 'Atualizar cidade',
    description:
      'status=PUBLISHED exige exatamente 5 imagens originais. Rascunho não tem esse mínimo.',
  })
  updateCity(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCityDto,
  ) {
    return this.imageBank.updateCity(id, dto);
  }

  @Delete('cities/:id')
  @ApiOperation({ summary: 'Apagar cidade e os objetos das fotos' })
  deleteCity(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imageBank.deleteCity(id);
  }

  @Post('cities/:cityId/images')
  @ApiOperation({
    summary: 'Enviar foto HD de um ponto turístico',
    description:
      'Grava o arquivo no object storage e a linha no Postgres (chave, mime, largura, altura, bytes, texto alternativo, ordem). A resposta traz a URL de leitura, nunca o binário. sortOrder de 1 a 5. Reenviar o mesmo sortOrder substitui a foto. A sexta original é recusada.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'spotName', 'altText', 'sortOrder'],
      properties: {
        file: { type: 'string', format: 'binary' },
        spotName: { type: 'string', example: 'Cristo Redentor' },
        altText: { type: 'string', example: 'Cristo Redentor no Corcovado' },
        sortOrder: { type: 'integer', minimum: 1, maximum: 5, example: 1 },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: imageBankMaxBytes() },
    }),
  )
  uploadImage(
    @Param('cityId', new ParseUUIDPipe()) cityId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadSpotImageDto,
  ) {
    return this.imageBank.uploadImage(cityId, file, dto);
  }

  @Patch('images/:id')
  @ApiOperation({
    summary: 'Atualizar ponto, texto alternativo ou ordem',
    description:
      'Não troca o arquivo. Para substituir a foto, reenvie o upload no mesmo sortOrder. Se a ordem já estiver ocupada, as duas fotos trocam de lugar.',
  })
  updateImage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSpotImageDto,
  ) {
    return this.imageBank.updateImage(id, dto);
  }

  @Delete('images/:id')
  @ApiOperation({
    summary: 'Remover foto de um rascunho',
    description: `Cidade publicada responde ${HttpStatus.CONFLICT} até ser despublicada.`,
  })
  deleteImage(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imageBank.deleteImage(id);
  }
}
