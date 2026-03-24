import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;
}

export class PaginatedResponse<T> {
  data!: T[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;

  static of<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
    const res = new PaginatedResponse<T>();
    res.data = data;
    res.total = total;
    res.page = page;
    res.limit = limit;
    res.totalPages = Math.ceil(total / limit);
    return res;
  }
}
