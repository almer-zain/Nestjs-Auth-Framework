import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { RequestWithUser } from 'src/common/types/jwt-types';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.sub;

    if (!userId) {
      return false;
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'isEmailVerified'],
    });

    if (!user || !user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email address before accessing this feature.',
      );
    }

    return true;
  }
}
