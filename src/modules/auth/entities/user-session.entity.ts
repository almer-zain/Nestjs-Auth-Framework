import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  refreshTokenHash: string;

  @Column({ type: 'varchar', length: 45, default: '127.0.0.1' })
  ipAddress: string;

  @Column({ type: 'varchar', length: 500, default: 'Unknown Device' })
  userAgent: string;

  @Column({ type: 'boolean', default: false })
  isRevoked: boolean;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  lastActiveAt: Date;
}
