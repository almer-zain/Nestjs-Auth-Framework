import { Entity, OneToMany } from 'typeorm';
import { BaseAccount } from 'src/common/entities/base-account.abstract';
import { UserSession } from 'src/modules/auth/entities/user-session.entity';

@Entity('users')
export class User extends BaseAccount {
  @OneToMany(() => UserSession, (session) => session.user)
  sessions: UserSession[];
}
