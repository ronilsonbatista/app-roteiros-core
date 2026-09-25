import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog.dto';
import { ContentStatus } from '@prisma/client';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private async generateUniqueSlug(baseText: string, currentId?: string): Promise<string> {
    const baseSlug = this.slugify(baseText);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.blogPost.findUnique({ where: { slug } });
      if (!existing || existing.id === currentId) {
        return slug;
      }
      slug = `${baseSlug}-${counter++}`;
    }
  }

  // ==========================================
  // ADMIN METHODS
  // ==========================================

  async getAdminPosts(page = 1, limit = 10, filters?: { status?: ContentStatus; category?: string; search?: string }) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { summary: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPost(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!post) throw new NotFoundException('Artigo de blog não encontrado');
    return post;
  }

  async createPost(dto: CreateBlogPostDto, userId?: string) {
    const slug = dto.slug
      ? await this.generateUniqueSlug(dto.slug)
      : await this.generateUniqueSlug(dto.title);

    return this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        summary: dto.summary,
        content: dto.content,
        coverImage: dto.coverImage,
        category: dto.category || 'Dicas de Viagem',
        tags: dto.tags || [],
        relatedDestinations: dto.relatedDestinations || [],
        authorName: dto.authorName || 'Equipe 2GO',
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        canonicalUrl: dto.canonicalUrl,
        status: dto.status || ContentStatus.DRAFT,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        publishedAt: dto.status === ContentStatus.PUBLISHED ? new Date() : null,
        createdById: userId,
      },
    });
  }

  async updatePost(id: string, dto: UpdateBlogPostDto) {
    const current = await this.getPost(id);

    let slug: string | undefined = undefined;
    if (dto.slug && dto.slug !== current.slug) {
      slug = await this.generateUniqueSlug(dto.slug, id);
    } else if (dto.title && !dto.slug && dto.title !== current.title && current.status === ContentStatus.DRAFT) {
      slug = await this.generateUniqueSlug(dto.title, id);
    }

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        title: dto.title,
        ...(slug ? { slug } : {}),
        summary: dto.summary,
        content: dto.content,
        coverImage: dto.coverImage,
        category: dto.category,
        tags: dto.tags,
        relatedDestinations: dto.relatedDestinations,
        authorName: dto.authorName,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        canonicalUrl: dto.canonicalUrl,
        status: dto.status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        publishedAt:
          dto.status === ContentStatus.PUBLISHED && !current.publishedAt
            ? new Date()
            : undefined,
      },
    });
  }

  async publishPost(id: string) {
    await this.getPost(id);

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  }

  async deletePost(id: string) {
    await this.getPost(id);
    return this.prisma.blogPost.delete({ where: { id } });
  }

  // ==========================================
  // PUBLIC WEBSITE METHODS
  // ==========================================

  async getPublicPosts(page = 1, limit = 10, category?: string, tag?: string) {
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: any = {
      status: ContentStatus.PUBLISHED,
      publishedAt: { lte: now },
    };

    if (category) where.category = category;
    if (tag) where.tags = { has: tag };

    const [data, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          coverImage: true,
          category: true,
          tags: true,
          authorName: true,
          publishedAt: true,
          seoTitle: true,
          seoDescription: true,
        },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPublicPostBySlug(slug: string) {
    const now = new Date();
    const post = await this.prisma.blogPost.findFirst({
      where: {
        slug,
        status: ContentStatus.PUBLISHED,
        publishedAt: { lte: now },
      },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado ou indisponível.');
    }

    return post;
  }
}
