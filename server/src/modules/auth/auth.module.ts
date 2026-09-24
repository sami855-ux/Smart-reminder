import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RequestMetadataService } from '../../common/security/request-metadata.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordService } from './password.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TokenService } from './token.service.js';
import { AuthEmailService } from './auth-email.service.js';
import { AccountPurgeService } from './account-purge.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthEmailService,
    AccountPurgeService,
    JwtAuthGuard,
    JwtStrategy,
    PasswordService,
    RequestMetadataService,
    TokenService,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
