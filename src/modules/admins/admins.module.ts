import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { UserSession } from '../auth/entities/user-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, UserSession])],
  controllers: [AdminsController],
  providers: [AdminsService],
  exports: [AdminsService], // Export in case AuthModule needs to verify admins
})
export class AdminsModule {}
