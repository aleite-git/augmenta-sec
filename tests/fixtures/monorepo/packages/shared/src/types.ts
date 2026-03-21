export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
}
