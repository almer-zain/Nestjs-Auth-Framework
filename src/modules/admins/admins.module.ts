import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './entities/admin.entity';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { Role } from '../roles/entities/role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin, Role])],
  controllers: [AdminsController],
  providers: [AdminsService],
  exports: [AdminsService], // Export in case AuthModule needs to verify admins
})
export class AdminsModule {}
