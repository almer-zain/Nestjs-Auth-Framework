import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Registered account email address',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
