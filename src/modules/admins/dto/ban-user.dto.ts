import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';

export class BanUserDto {
  @ApiProperty({
    example: 'Violated Terms of Service: Spamming',
    description: 'Reason for the ban',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({
    example: '2026-12-31T23:59:59.000Z',
    required: false,
    description: 'Leave empty for a permanent ban',
  })
  @IsOptional()
  @IsDateString()
  bannedUntil?: string;
}
