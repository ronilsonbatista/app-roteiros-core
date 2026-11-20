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
    summary: 'Cards dos destinos publicados',
    description:
      'Payload leve: nome, slug, cidade principal (menor sortOrder) e uma URL de capa. Não traz as 5 fotos nem width, height ou bytes.',
  })
  listDestinations(@Query() query: PublicListQueryDto) {
    return this.imageBank.listPublicDestinations(query);
  }

  @Get('destinations/:slug/cities/:citySlug')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({
    summary: 'Cidade publicada e suas 5 fotos HD',
    description:
      'Cada foto traz só url, alt e order. A url é assinada (S3) ou o path público do filesystem. O JSON não contém o arquivo nem width, height ou bytes.',
  })
  getCity(@Param('slug') slug: string, @Param('citySlug') citySlug: string) {
    return this.imageBank.getPublicCity(slug, citySlug);
  }

  @Get('destinations/:slug')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({
    summary: 'Destino publicado, sem as fotos HD',
    description:
      'Mesmo card da lista, mais os nomes e slugs das cidades publicadas. As 5 fotos ficam em GET .../cities/:citySlug.',
  })
  getDestination(@Param('slug') slug: string) {
    return this.imageBank.getPublicDestination(slug);
  }
}
