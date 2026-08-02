import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  transformEmail,
  transformSanitizeHtmlClean,
} from 'src/utils/sanitize.util';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  @Transform(transformEmail) // Normalizes to lowercase and trims
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(transformSanitizeHtmlClean) // Standard string trimming
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(transformSanitizeHtmlClean) // Strips out malicious HTML/Script tags
  usernameDisplay: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string; // Passwords should not be sanitized or trimmed to allow special characters/spaces

  @ApiProperty({ type: [Number], required: false })
  @IsArray()
  @IsNumber({}, { each: true }) // Ensures the array elements are actual numbers
  @IsOptional()
  roleIds?: number[];
}
