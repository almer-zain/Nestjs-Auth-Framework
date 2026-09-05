// entities/role.entity.ts
import { Permission } from 'src/modules/permissions/entities/permission.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, length: 50 })
  name: string;

  @ManyToMany(() => Permission)
  @JoinTable({ name: 'roles_permissions_permissions' })
  permissions: Permission[];

  // --- Audit Timestamps ---
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}

export interface AccountWithRoles {
  id: number;
  email: string;
  roles: Role[];
}
