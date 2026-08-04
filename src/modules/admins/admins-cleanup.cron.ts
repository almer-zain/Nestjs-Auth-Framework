import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Admin } from './entities/admin.entity';

@Injectable()
export class UsersCleanupCron {
  constructor(@InjectRepository(Admin) private adminRepo: Repository<Admin>) {}

  @Cron('0 0 * * *') // Runs every night at midnight
  async hardScrubExpiredAccounts() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find accounts soft-deleted more than 30 days ago
    const expiredAdmins = await this.adminRepo.find({
      where: { deletedAt: LessThan(thirtyDaysAgo) },
      withDeleted: true,
    });

    for (const admin of expiredAdmins) {
      // Scrub the user data
      admin.email = `deleted-${admin.id}@anonymized.local`;
      admin.username = `deleted_${admin.id}`;
      admin.displayName = 'Anonymized Admins';
      admin.password = 'SCRUBBED';

      await this.adminRepo.save(admin);
    }
  }
}
