import { PartialType } from '@nestjs/swagger';
import { CreateCompanyExpenseDto } from './create-company-expense.dto';

export class UpdateCompanyExpenseDto extends PartialType(CreateCompanyExpenseDto) {}
