import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseStatus, AIRequestStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers, blockedUsers, newUsersLast30Days,
      totalTrips, premiumUnlockedTrips, sharedTrips,
      purchasesAgg, pendingPurchasesCount, paidPurchasesCount,
      aiTotal, aiSuccess, aiFailed, aiTokens
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { blockedAt: { not: null } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      
      this.prisma.trip.count(),
      this.prisma.trip.count({ where: { premiumUnlockedAt: { not: null } } }),
      this.prisma.tripParticipant.count(),

      this.prisma.purchase.aggregate({
        _sum: { amount: true },
        where: { status: PurchaseStatus.PAID },
      }),
      this.prisma.purchase.count({ where: { status: PurchaseStatus.PENDING } }),
      this.prisma.purchase.count({ where: { status: PurchaseStatus.PAID } }),

      this.prisma.aIRequest.count(),
      this.prisma.aIRequest.count({ where: { status: AIRequestStatus.SUCCESS } }),
      this.prisma.aIRequest.count({ where: { status: AIRequestStatus.FAILED } }),
      this.prisma.aIRequest.aggregate({
        _sum: { tokensUsed: true },
        where: { status: AIRequestStatus.SUCCESS },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        blocked: blockedUsers,
        newLast30Days: newUsersLast30Days,
      },
      trips: {
        total: totalTrips,
        premiumUnlocked: premiumUnlockedTrips,
        sharedTrips,
      },
      billing: {
        totalRevenue: purchasesAgg._sum.amount || 0,
        paidPurchases: paidPurchasesCount,
        pendingPurchases: pendingPurchasesCount,
      },
      ai: {
        totalRequests: aiTotal,
        successRequests: aiSuccess,
        failedRequests: aiFailed,
        estimatedTokensUsed: aiTokens._sum.tokensUsed || 0,
      },
    };
  }

  async getRevenue(startDate?: string, endDate?: string) {
    const where: any = { status: PurchaseStatus.PAID };
    if (startDate || endDate) {
      where.paidAt = {};
      if (startDate) where.paidAt.gte = new Date(startDate);
      if (endDate) where.paidAt.lte = new Date(endDate);
    }

    const totalAgg = await this.prisma.purchase.aggregate({
      _sum: { amount: true },
      where,
    });

    const purchasesByType = await this.prisma.purchase.groupBy({
      by: ['productId'],
      _sum: { amount: true },
      where,
    });

    const products = await this.prisma.product.findMany({
      where: { id: { in: purchasesByType.map(p => p.productId) } },
    });

    const revenueByProductType = purchasesByType.reduce((acc, curr) => {
      const p = products.find(prod => prod.id === curr.productId);
      if (p) {
        if (!acc[p.type]) acc[p.type] = 0;
        acc[p.type] += curr._sum.amount || 0;
      }
      return acc;
    }, {} as Record<string, number>);

    const whereAllStatuses: any = {};
    if (startDate || endDate) {
      whereAllStatuses.createdAt = {};
      if (startDate) whereAllStatuses.createdAt.gte = new Date(startDate);
      if (endDate) whereAllStatuses.createdAt.lte = new Date(endDate);
    }

    const purchasesByStatus = await this.prisma.purchase.groupBy({
      by: ['status'],
      _count: true,
      where: whereAllStatuses,
    });

    return {
      totalRevenue: totalAgg._sum.amount || 0,
      revenueByProductType,
      purchasesByStatus: purchasesByStatus.map(p => ({
        status: p.status,
        count: p._count,
      })),
    };
  }

  async getAiUsage() {
    const [byProvider, byModel, topUsers, errors] = await Promise.all([
      this.prisma.aIRequest.groupBy({ by: ['provider'], _count: true }),
      this.prisma.aIRequest.groupBy({ by: ['model'], _count: true }),
      this.prisma.aIRequest.groupBy({
        by: ['userId'],
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
      this.prisma.aIRequest.findMany({
        where: { status: AIRequestStatus.FAILED },
        select: { id: true, provider: true, errorMessage: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const totalTokens = await this.prisma.aIRequest.aggregate({
      _sum: { tokensUsed: true },
      where: { status: AIRequestStatus.SUCCESS },
    });

    return {
      requestsByProvider: byProvider,
      requestsByModel: byModel,
      totalTokensUsed: totalTokens._sum.tokensUsed || 0,
      topUsers,
      recentFailures: errors,
    };
  }

  async getTopDestinations() {
    const [tripsDestinations, baseTripsDestinations] = await Promise.all([
      this.prisma.trip.groupBy({
        by: ['destination'],
        _count: true,
        orderBy: { _count: { destination: 'desc' } },
        take: 10,
      }),
      this.prisma.baseTrip.groupBy({
        by: ['destination'],
        _count: true,
        orderBy: { _count: { destination: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      tripsDestinations,
      baseTripsDestinations,
    };
  }

  async getUsersGrowth() {
    // Para simplificar: usuários por mês nos últimos 6 meses (exemplo de implementação)
    const users = await this.prisma.user.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const growth = users.reduce((acc, user) => {
      const monthYear = `${user.createdAt.getFullYear()}-${String(user.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthYear]) acc[monthYear] = 0;
      acc[monthYear]++;
      return acc;
    }, {} as Record<string, number>);

    return growth;
  }

  async getTripsGrowth() {
    const trips = await this.prisma.trip.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const growth = trips.reduce((acc, trip) => {
      const monthYear = `${trip.createdAt.getFullYear()}-${String(trip.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthYear]) acc[monthYear] = 0;
      acc[monthYear]++;
      return acc;
    }, {} as Record<string, number>);

    return growth;
  }

  getStorageStats() {
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      return { totalFiles: 0, totalSize: 0, breakdown: {} };
    }

    const result = {
      totalFiles: 0,
      totalSize: 0,
      breakdown: {} as Record<string, { files: number; size: number }>,
    };

    const countFilesAndSize = (dir: string, folderName: string) => {
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir);
      
      if (!result.breakdown[folderName]) {
        result.breakdown[folderName] = { files: 0, size: 0 };
      }

      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          result.totalFiles++;
          result.totalSize += stats.size;
          result.breakdown[folderName].files++;
          result.breakdown[folderName].size += stats.size;
        } else if (stats.isDirectory()) {
          // Apenas um nível para o breakdown simples
          countFilesAndSize(fullPath, file);
        }
      });
    };

    // Lê a pasta raiz 'uploads'
    const rootFiles = fs.readdirSync(uploadDir);
    rootFiles.forEach((file) => {
      const fullPath = path.join(uploadDir, file);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        countFilesAndSize(fullPath, file);
      } else {
        if (!result.breakdown['root']) result.breakdown['root'] = { files: 0, size: 0 };
        result.totalFiles++;
        result.totalSize += stats.size;
        result.breakdown['root'].files++;
        result.breakdown['root'].size += stats.size;
      }
    });

    return result;
  }

  async getSystemHealth() {
    let dbStatus = 'OK';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = 'DOWN';
    }

    return {
      databaseStatus: dbStatus,
      uploadsFolderExists: fs.existsSync(path.join(process.cwd(), 'uploads')),
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      googlePlacesConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
      mediaStorageProvider: process.env.MEDIA_STORAGE_PROVIDER || 'local',
      timestamp: new Date().toISOString(),
    };
  }
}
