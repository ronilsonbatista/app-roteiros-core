import { Test, TestingModule } from '@nestjs/testing';
import { BlogService } from './blog.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('BlogService', () => {
  let service: BlogService;
  let prisma: any;

  const mockPrisma = {
    blogPost: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BlogService>(BlogService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('getAdminPosts', () => {
    it('should return paginated posts with metadata', async () => {
      mockPrisma.blogPost.findMany.mockResolvedValue([
        { id: 'p1', title: 'Post 1', slug: 'post-1', status: ContentStatus.DRAFT },
      ]);
      mockPrisma.blogPost.count.mockResolvedValue(1);

      const result = await service.getAdminPosts(1, 10, { search: 'Post' });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.blogPost.findMany).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    it('should generate a unique slug and create post as DRAFT by default', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      mockPrisma.blogPost.create.mockResolvedValue({
        id: 'p1',
        title: 'Dicas de Lisboa',
        slug: 'dicas-de-lisboa',
        status: ContentStatus.DRAFT,
      });

      const res = await service.createPost({
        title: 'Dicas de Lisboa',
        summary: 'Resumo sobre Lisboa',
        content: 'Conteudo completo sobre Lisboa',
      });

      expect(res.slug).toBe('dicas-de-lisboa');
      expect(mockPrisma.blogPost.create).toHaveBeenCalled();
    });
  });

  describe('publishPost', () => {
    it('should transition status to PUBLISHED and record publishedAt', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({
        id: 'p1',
        title: 'Dicas de Lisboa',
        status: ContentStatus.DRAFT,
      });
      mockPrisma.blogPost.update.mockResolvedValue({
        id: 'p1',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
      });

      const res = await service.publishPost('p1');
      expect(res.status).toBe(ContentStatus.PUBLISHED);
      expect(mockPrisma.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ status: ContentStatus.PUBLISHED }),
        }),
      );
    });
  });

  describe('getPublicPosts', () => {
    it('should only query published posts with publishedAt in the past', async () => {
      mockPrisma.blogPost.findMany.mockResolvedValue([
        { id: 'p1', title: 'Public Post', status: ContentStatus.PUBLISHED },
      ]);
      mockPrisma.blogPost.count.mockResolvedValue(1);

      const res = await service.getPublicPosts(1, 10);
      expect(res.data).toHaveLength(1);
      expect(mockPrisma.blogPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ContentStatus.PUBLISHED,
          }),
        }),
      );
    });
  });

  describe('getPublicPostBySlug', () => {
    it('should throw NotFoundException if post is not published', async () => {
      mockPrisma.blogPost.findFirst.mockResolvedValue(null);

      await expect(service.getPublicPostBySlug('unpublished-post')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
