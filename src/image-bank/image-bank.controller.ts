import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImageBankService } from './image-bank.service';
import { PublicListQueryDto } from './dto/image-bank.dto';

@ApiTags('Image Bank - Public')
@Controller('image-bank')
export class ImageBankController {
  constructor(private readonly imageBank: ImageBankService) {}

  @Get('destinations')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({
    summary: 'Destinos publicados do banco de imagens',
    description:
      'Não inclui o binário. As URLs das fotos ficam no detalhe do destino ou da cidade.',
  })
  listDestinations(@Query() query: PublicListQueryDto) {
    return this.imageBank.listPublicDestinations(query);
  }

  @Get('destinations/:slug/cities/:citySlug')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({
    summary: 'Cidade publicada e suas 5 fotos HD',
    description:
      'Cada imagem traz url assinada (S3/MinIO/R2) ou path público do filesystem de dev. O JSON não contém o arquivo.',
  })
  getCity(@Param('slug') slug: string, @Param('citySlug') citySlug: string) {
    return this.imageBank.getPublicCity(slug, citySlug);
  }

  @Get('destinations/:slug')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({
    summary: 'Destino publicado com cidades e fotos',
    description:
      'Somente cidades PUBLISHED. Cada uma deve ter 5 imagens originais, com url de leitura e metadados (mime, largura, altura, bytes, texto alternativo, ordem).',
  })
  getDestination(@Param('slug') slug: string) {
    return this.imageBank.getPublicDestination(slug);
  }
}
