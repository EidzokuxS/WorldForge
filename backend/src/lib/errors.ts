export { getErrorMessage } from "@worldforge/shared";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

type ErrorStatusCode = 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 | 500;

export function getErrorStatus(
  error: unknown,
  fallback: ErrorStatusCode = 500
): ErrorStatusCode {
  if (error instanceof AppError) {
    const code = error.statusCode;
    if (code >= 400 && code < 500) {
      return code as ErrorStatusCode;
    }
    return 500;
  }
  return fallback;
}
