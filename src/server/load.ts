import 'server-only';
import { notFound } from 'next/navigation';
import { AppError } from './services/errors';

/** Await a load; turn "not found" (including other users' ids, hidden by RLS) into a 404 page. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
