import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IsValidUsername } from 'src/utils/auth-decorator.util';
import {
  transformEmail,
  transformSanitizeHtmlClean,
} from 'src/utils/sanitize.util';

export class RegisterDto {
  @ApiProperty()
  @IsValidUsername()
  @Transform(transformSanitizeHtmlClean)
  username: string;

  @ApiProperty()
  @IsEmail()
  @Transform(transformEmail)
  email: string;

  @ApiProperty()
  @MinLength(8)
  password: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  captchaToken?: string;
}
