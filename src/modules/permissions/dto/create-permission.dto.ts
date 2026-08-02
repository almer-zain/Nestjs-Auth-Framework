import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { transformSanitizeHtmlClean } from 'src/utils/sanitize.util';

export class CreatePermissionDto {
  @ApiProperty({ example: 'users.create' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_.]+$/, {
    message:
      'Permission name can only contain lowercase letters, numbers, underscores, and dots.',
  })
  @Transform(transformSanitizeHtmlClean)
  name: string;

  @ApiPropertyOptional({ example: 'Allows creating new users' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(transformSanitizeHtmlClean)
  description?: string;
}
