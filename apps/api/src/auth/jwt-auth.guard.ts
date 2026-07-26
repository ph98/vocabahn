import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE } from './cookies';
import type { JwtPayload } from './auth.service';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // httpOnly cookie for web; Authorization: Bearer for native clients
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[ACCESS_COOKIE] ?? bearer;
    if (!token) {
      throw new UnauthorizedException('Not signed in');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    req.userId = payload.sub;
    return true;
  }
}

export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().userId,
);
