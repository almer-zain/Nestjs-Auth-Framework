import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('account_devices')
@Index(['accountId', 'accountType'])
export class AccountDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  accountId: number;

  @Column()
  accountType: string; // 'user' | 'admin'

  @Column()
  ipAddress: string;

  @Column()
  browser: string;

  @Column()
  os: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastLoginAt: Date;
}
