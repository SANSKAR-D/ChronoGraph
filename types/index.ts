export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
}
