import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BlogService } from './blog.service';

@ApiTags('Public - Blog')
@Controller('blog/posts')
export class BlogPublicController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'Listar artigos publicados para o Site/Web' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'tag', required: false, type: String })
  getPublishedPosts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
  ) {
    return this.blogService.getPublicPosts(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      category,
      tag,
    );
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Visualizar artigo publicado por slug' })
  getPublishedPostBySlug(@Param('slug') slug: string) {
    return this.blogService.getPublicPostBySlug(slug);
  }
}
