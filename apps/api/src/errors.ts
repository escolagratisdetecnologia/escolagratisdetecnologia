export interface ApiError {
  error: { code: string; message: string };
}

/** Error body of every route: code in English snake_case, message in pt-BR. */
export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
