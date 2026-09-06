import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({ example: [1, 2], description: 'Array of Role IDs to assign' })
  @IsArray()
  @IsInt({ each: true })
  roleIds: number[];
}
