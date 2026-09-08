import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Verify2FADto {
  @ApiProperty({
    description: 'Short-lived JWT ticket returned from /auth/login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  mfaTicket: string;

  @ApiProperty({
    description: '6-digit OTP OR 9-character recovery code (e.g., A1B2-C3D4)',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 12, { message: 'Must be a 6-digit OTP or a valid backup code' })
  token: string;
}
