import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToMany,
  JoinTable,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role } from 'src/modules/roles/entities/role.entity';

export abstract class BaseAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, length: 255 })
  email: string;

  @Column({ type: 'varchar', unique: true, length: 100 })
  username: string;

  @Column({ type: 'varchar', length: 255 })
  displayName: string;

  @Column({ type: 'varchar', select: false })
  @Exclude()
  password: string;

  // --- Moderation ---
  @Column({ type: 'boolean', default: false })
  isBanned: boolean;

  @Column({ type: 'varchar', nullable: true })
  banReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  bannedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  bannedUntil: Date | null;

  // --- Multi-Factor Authentication ---
  @Column({ type: 'boolean', default: false })
  isTwoFactorEnabled: boolean;

  @Column({ type: 'varchar', nullable: true, select: false })
  @Exclude()
  twoFactorSecret: string | null;

  @Column({ type: 'simple-array', nullable: true, select: false })
  @Exclude()
  twoFactorRecoveryCodes: string[] | null;

  // --- Password Recovery ---
  @Column({ type: 'varchar', nullable: true, select: false })
  @Exclude()
  passwordResetCode: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  @Exclude()
  passwordResetExpires: Date | null;

  // --- Access Control ---
  @ManyToMany(() => Role)
  @JoinTable()
  roles: Role[];

  // --- Email Verification ---
  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', nullable: true, select: false })
  @Exclude()
  emailVerificationToken: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  @Exclude()
  emailVerificationExpires: Date | null;

  // --- Timestamps ---
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  @Exclude()
  deletedAt: Date | null;

  @BeforeInsert()
  @BeforeUpdate()
  protected sanitizeAccountData(): void {
    if (this.email) this.email = this.email.toLowerCase().trim();
    if (this.username) this.username = this.username.toLowerCase().trim();
    if (this.displayName) this.displayName = this.displayName.trim();
  }
}
