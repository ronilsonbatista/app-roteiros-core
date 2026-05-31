import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { ChangePasswordAdminDto } from './dto/change-password-admin.dto';
import { UpdateUserTravelProfileDto } from '../user-travel-profile/dto/update-user-travel-profile.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getUsers(page: number = 1, limit: number = 10, search?: string) {
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          emailConfirmed: true,
          blockedAt: true,
          archivedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: whereClause }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { trips: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async blockUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw new ForbiddenException('Admin não pode bloquear a si mesmo');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: { blockedAt: new Date() },
      select: { id: true, email: true, blockedAt: true },
    });
  }

  async unblockUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: { blockedAt: null },
      select: { id: true, email: true, blockedAt: true },
    });
  }

  async logoutAll(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { message: 'Todos os tokens ativos do usuário foram revogados com sucesso' };
  }

  async getUserTrips(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(dto: CreateUserAdminDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Email já está em uso');
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        role: dto.role,
        emailConfirmed: true,
      },
    });

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(id: string, dto: UpdateUserAdminDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new BadRequestException('Email já está em uso');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    const { passwordHash: _, ...safeUser } = updatedUser;
    return safeUser;
  }

  async changeUserPassword(id: string, dto: ChangePasswordAdminDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(dto.password, salt);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { message: 'Senha do usuário atualizada com sucesso' };
  }

  async updateUserTravelProfile(userId: string, dto: UpdateUserTravelProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.userTravelProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async archiveUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw new ForbiddenException('Admin não pode arquivar a própria conta');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: { archivedAt: new Date() },
      select: { id: true, email: true, archivedAt: true },
    });
  }

  async restoreUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: { archivedAt: null },
      select: { id: true, email: true, archivedAt: true },
    });
  }
}
