import { ZodError } from 'zod';

/** An expected, user-facing failure (validation, not found, ambiguity). */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) {
    const i = e.issues[0];
    return i ? `${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid input';
  }
  if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '42501') {
    return 'Not allowed';
  }
  console.error(e);
  return 'Something went wrong. Nothing was saved.';
}
