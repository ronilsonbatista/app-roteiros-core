import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('signup')
  @ApiOperation({ summary: 'Registrar novo usuário com senha' })
  @ApiResponse({ status: 201, description: 'Usuário registrado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Email já está em uso.' })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar usuário com e-mail e senha' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Credenciais inválidas ou usuário bloqueado.',
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar tokens de acesso usando o refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens renovados com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido ou usuário bloqueado.',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar código OTP de 6 dígitos por e-mail' })
  @ApiResponse({ status: 200, description: 'Código enviado com sucesso.' })
  @ApiResponse({ status: 429, description: 'Aguarde antes de solicitar novo código.' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar código OTP de 6 dígitos e iniciar sessão (Passwordless / Auth)' })
  @ApiResponse({ status: 200, description: 'Sessão criada e tokens retornados.' })
  @ApiResponse({ status: 400, description: 'Código OTP incorreto ou expirado.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas excedido.' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revogar sessão atual (Server-side logout)' })
  @ApiResponse({ status: 200, description: 'Sessão encerrada com sucesso.' })
  async logout(@Req() req: any, @Body() dto?: RefreshTokenDto) {
    const userId = req.user?.userId || req.user?.sub;
    return this.authService.logout(userId, dto?.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revogar todas as sessões ativas do usuário' })
  @ApiResponse({ status: 200, description: 'Todas as sessões encerradas.' })
  async logoutAll(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.authService.logoutAll(userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar código OTP para redefinição de senha' })
  @ApiResponse({ status: 200, description: 'Solicitação processada.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefinir senha utilizando o código OTP de verificação' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso.' })
  @ApiResponse({ status: 400, description: 'Código inválido ou expirado.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
