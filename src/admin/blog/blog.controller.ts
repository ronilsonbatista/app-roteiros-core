import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role, ContentStatus } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin - Blog / CMS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/blog/posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os artigos do blog (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ContentStatus })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  getPosts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ContentStatus,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.blogService.getAdminPosts(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      { status, category, search },
    );
  }

  @Post()
  @ApiOperation({ summary: 'Criar um novo artigo (DRAFT)' })
  createPost(@CurrentUser() admin: any, @Body() dto: CreateBlogPostDto) {
    return this.blogService.createPost(dto, admin?.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de um artigo' })
  getPost(@Param('id') id: string) {
    return this.blogService.getPost(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar artigo' })
  updatePost(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blogService.updatePost(id, dto);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publicar artigo (altera status para PUBLISHED)' })
  publishPost(@Param('id') id: string) {
    return this.blogService.publishPost(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir artigo' })
  deletePost(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }
}
