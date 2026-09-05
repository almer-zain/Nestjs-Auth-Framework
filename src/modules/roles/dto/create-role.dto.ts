import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { transformSanitizeHtmlClean } from 'src/utils/sanitize.util';

export class CreateRoleDto {
  @ApiProperty({ example: 'super-admin' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'Role name can only contain lowercase letters, numbers, and hyphens.',
  })
  @Transform(transformSanitizeHtmlClean)
  name: string;

  @ApiPropertyOptional({ example: [1, 2, 3] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  permissionIds?: number[];
}
