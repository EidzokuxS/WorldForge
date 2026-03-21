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

export function getErrorStatus(
  error: unknown,
  fallback: 400 | 404 | 500 = 500
): 400 | 404 | 500 {
  if (error instanceof AppError) {
    const code = error.statusCode;
    if (code === 400 || code === 404) {
      return code;
    }
    return 500;
  }
  return fallback;
}
