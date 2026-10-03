import { Test, TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { AuditService } from '../audit/audit.service';

describe('SystemController', () => {
  let controller: SystemController;
  let systemService: SystemService;

  const mockHealth = {
    environment: 'test',
    timestamp: new Date().toISOString(),
    providers: {
      database: { name: 'PostgreSQL', status: 'HEALTHY', configured: true },
    },
  };

  const mockSystemService = {
    getProviderHealth: jest.fn().mockResolvedValue(mockHealth),
    globalSearch: jest.fn(),
  };

  const mockAuditService = {
    getLogs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [
        { provide: SystemService, useValue: mockSystemService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    controller = module.get<SystemController>(SystemController);
    systemService = module.get<SystemService>(SystemService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProviderHealth', () => {
    it('should return provider health from systemService', async () => {
      const res = await controller.getProviderHealth();
      expect(res).toBe(mockHealth);
      expect(systemService.getProviderHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProviders (alias)', () => {
    it('should return provider health from systemService identically', async () => {
      const res = await controller.getProviders();
      expect(res).toBe(mockHealth);
      expect(systemService.getProviderHealth).toHaveBeenCalledTimes(1);
    });
  });
});
