import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Verification token sent via email' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
