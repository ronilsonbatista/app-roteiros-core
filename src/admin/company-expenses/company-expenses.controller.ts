import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CompanyExpensesService } from './company-expenses.service';
import { CreateCompanyExpenseDto } from './dto/create-company-expense.dto';
import { UpdateCompanyExpenseDto } from './dto/update-company-expense.dto';
import {
  QueryCompanyExpenseDto,
  QueryCompanyExpenseSummaryDto,
} from './dto/query-company-expense.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin - Company Expenses (Opex & Custos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/company-expenses')
export class CompanyExpensesController {
  constructor(private readonly companyExpensesService: CompanyExpensesService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Obter resumo financeiro e totais agrupados por mês e categoria' })
  getSummary(@Query() query: QueryCompanyExpenseSummaryDto) {
    return this.companyExpensesService.getSummary(query);
  }

  @Get()
  @ApiOperation({ summary: 'Listar despesas operacionais da empresa com filtros e paginação' })
  findAll(@Query() query: QueryCompanyExpenseDto) {
    return this.companyExpensesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar nova despesa operacional da empresa' })
  create(
    @Body() dto: CreateCompanyExpenseDto,
    @CurrentUser() user: any,
  ) {
    const adminId = user?.userId || user?.id;
    return this.companyExpensesService.create(dto, adminId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma despesa específica por ID' })
  findOne(@Param('id') id: string) {
    return this.companyExpensesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados de uma despesa existente' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyExpenseDto,
  ) {
    return this.companyExpensesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir despesa (soft-delete por padrão ou hard delete via ?hard=true)' })
  @ApiQuery({ name: 'hard', required: false, type: Boolean })
  remove(
    @Param('id') id: string,
    @Query('hard') hard?: string,
  ) {
    const isHard = hard === 'true';
    return this.companyExpensesService.remove(id, isHard);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arquivar despesa (soft-delete)' })
  archive(@Param('id') id: string) {
    return this.companyExpensesService.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar despesa arquivada' })
  restore(@Param('id') id: string) {
    return this.companyExpensesService.restore(id);
  }
}
