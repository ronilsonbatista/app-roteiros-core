import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthErrorCode } from './enums/auth-error-codes.enum';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async signup(dto: SignupDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new HttpException(
        { message: 'Email já está em uso', code: AuthErrorCode.AUTH_USER_EXISTS },
        HttpStatus.BAD_REQUEST,
      );
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.usersService.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
    });

    return {
      message: 'Usuário registrado com sucesso',
      userId: user.id,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new HttpException(
        { message: 'Credenciais inválidas', code: AuthErrorCode.AUTH_CREDENTIALS_INVALID },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.blockedAt) {
      throw new HttpException(
        { message: 'Usuário bloqueado. Entre em contato com o suporte.', code: AuthErrorCode.AUTH_USER_BLOCKED },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.archivedAt) {
      throw new HttpException(
        { message: 'Usuário arquivado. Entre em contato com o suporte.', code: AuthErrorCode.AUTH_USER_ARCHIVED },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!user.passwordHash) {
      throw new HttpException(
        { message: 'Esta conta utiliza login por código OTP.', code: AuthErrorCode.AUTH_CREDENTIALS_INVALID },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new HttpException(
        { message: 'Credenciais inválidas', code: AuthErrorCode.AUTH_CREDENTIALS_INVALID },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.generateTokens(user.id, user.email, user.role);
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    const salt = await bcrypt.genSalt();
    const tokenHash = await bcrypt.hash(refreshToken, salt);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new HttpException(
          { message: 'Credenciais inválidas', code: AuthErrorCode.AUTH_CREDENTIALS_INVALID },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (user.blockedAt) {
        throw new HttpException(
          { message: 'Usuário bloqueado.', code: AuthErrorCode.AUTH_USER_BLOCKED },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (user.archivedAt) {
        throw new HttpException(
          { message: 'Usuário arquivado.', code: AuthErrorCode.AUTH_USER_ARCHIVED },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const activeTokens = await this.prisma.refreshToken.findMany({
        where: { userId: user.id, revokedAt: null },
      });

      let isValidToken = false;
      for (const tokenRecord of activeTokens) {
        if (await bcrypt.compare(refreshToken, tokenRecord.tokenHash)) {
          isValidToken = true;
          await this.prisma.refreshToken.update({
            where: { id: tokenRecord.id },
            data: { revokedAt: new Date() },
          });
          break;
        }
      }

      if (!isValidToken) {
        throw new HttpException(
          { message: 'Refresh token inválido ou revogado', code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID },
          HttpStatus.UNAUTHORIZED,
        );
      }

      return this.generateTokens(user.id, user.email, user.role);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { message: 'Refresh token inválido ou expirado', code: AuthErrorCode.AUTH_REFRESH_TOKEN_INVALID },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // --- OTP & PASSWORDLESS FLOWS ---

  async requestOtp(dto: RequestOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const purpose = dto.purpose || OtpPurpose.LOGIN;

    // Rate limit check: 60s cooldown
    const recentOtp = await this.prisma.authOtp.findFirst({
      where: {
        email,
        purpose,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });

    if (recentOtp) {
      throw new HttpException(
        { message: 'Aguarde 60 segundos antes de solicitar um novo código', code: AuthErrorCode.AUTH_OTP_RATE_LIMITED },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate previous active OTPs for email+purpose
    await this.prisma.authOtp.updateMany({
      where: { email, purpose, usedAt: null },
      data: { expiresAt: new Date() },
    });

    // Generate 6-digit random code
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt();
    const codeHash = await bcrypt.hash(rawCode, salt);
    const expiresInMinutes = 10;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await this.prisma.authOtp.create({
      data: {
        email,
        purpose,
        codeHash,
        expiresAt,
      },
    });

    await this.emailService.sendOtpEmail({
      to: email,
      code: rawCode,
      expiresInMinutes,
    });

    return {
      success: true,
      message: 'Código de verificação enviado com sucesso para o e-mail.',
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const purpose = dto.purpose || OtpPurpose.LOGIN;

    const activeOtp = await this.prisma.authOtp.findFirst({
      where: {
        email,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeOtp) {
      throw new HttpException(
        { message: 'Código OTP expirado ou não encontrado.', code: AuthErrorCode.AUTH_OTP_EXPIRED },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (activeOtp.attemptCount >= 5) {
      throw new HttpException(
        { message: 'Número máximo de tentativas excedido. Solicite um novo código.', code: AuthErrorCode.AUTH_OTP_TOO_MANY_ATTEMPTS },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isValid = await bcrypt.compare(dto.code, activeOtp.codeHash);
    if (!isValid) {
      await this.prisma.authOtp.update({
        where: { id: activeOtp.id },
        data: { attemptCount: activeOtp.attemptCount + 1 },
      });
      throw new HttpException(
        { message: 'Código de verificação incorreto.', code: AuthErrorCode.AUTH_OTP_INVALID },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Mark OTP as used
    await this.prisma.authOtp.update({
      where: { id: activeOtp.id },
      data: { usedAt: new Date() },
    });

    // Check or create user
    let user = await this.usersService.findByEmail(email);

    if (user) {
      if (user.blockedAt) {
        throw new HttpException(
          { message: 'Usuário bloqueado. Entre em contato com o suporte.', code: AuthErrorCode.AUTH_USER_BLOCKED },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (user.archivedAt) {
        throw new HttpException(
          { message: 'Usuário arquivado.', code: AuthErrorCode.AUTH_USER_ARCHIVED },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (!user.emailConfirmed) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { emailConfirmed: true },
        });
      }
    } else {
      // Passwordless Signup
      const defaultName = email.split('@')[0];
      const formattedName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: formattedName,
          emailConfirmed: true,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        emailConfirmed: user.emailConfirmed,
      },
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const activeTokens = await this.prisma.refreshToken.findMany({
        where: { userId, revokedAt: null },
      });
      for (const t of activeTokens) {
        if (await bcrypt.compare(refreshToken, t.tokenHash)) {
          await this.prisma.refreshToken.update({
            where: { id: t.id },
            data: { revokedAt: new Date() },
          });
          break;
        }
      }
    } else {
      await this.logoutAll(userId);
    }

    return { message: 'Sessão encerrada com sucesso.' };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Todas as sessões ativas foram encerradas.' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase().trim());
    if (user) {
      await this.requestOtp({
        email: user.email,
        purpose: OtpPurpose.PASSWORD_RESET,
      });
    }

    // Always return success to prevent email enumeration
    return {
      success: true,
      message: 'Se o e-mail estiver cadastrado, um código de verificação será enviado.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase().trim();

    const activeOtp = await this.prisma.authOtp.findFirst({
      where: {
        email,
        purpose: OtpPurpose.PASSWORD_RESET,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeOtp) {
      throw new HttpException(
        { message: 'Código de redefinição expirado ou não encontrado.', code: AuthErrorCode.AUTH_OTP_EXPIRED },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (activeOtp.attemptCount >= 5) {
      throw new HttpException(
        { message: 'Número máximo de tentativas excedido.', code: AuthErrorCode.AUTH_OTP_TOO_MANY_ATTEMPTS },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isValid = await bcrypt.compare(dto.code, activeOtp.codeHash);
    if (!isValid) {
      await this.prisma.authOtp.update({
        where: { id: activeOtp.id },
        data: { attemptCount: activeOtp.attemptCount + 1 },
      });
      throw new HttpException(
        { message: 'Código de verificação incorreto.', code: AuthErrorCode.AUTH_OTP_INVALID },
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new HttpException(
        { message: 'Usuário não encontrado.', code: AuthErrorCode.AUTH_USER_NOT_FOUND },
        HttpStatus.NOT_FOUND,
      );
    }

    // Mark OTP used
    await this.prisma.authOtp.update({
      where: { id: activeOtp.id },
      data: { usedAt: new Date() },
    });

    // Update password hash
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(dto.newPassword, salt);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Revoke all sessions for security
    await this.logoutAll(user.id);

    return {
      success: true,
      message: 'Senha redefinida com sucesso. Por favor, faça login com sua nova senha.',
    };
  }
}
