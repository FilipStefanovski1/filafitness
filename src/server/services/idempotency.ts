import type { Tx } from '../db';
import { sha256 } from './tokens';
import { AppError } from './errors';

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => k !== 'request_id' && (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * Run a write once per (user, request_id). The record is inserted in the same transaction
 * as the write, so a failed write leaves no record and a retry runs again; a replay of a
 * committed write returns the stored result. Reusing an id with different arguments fails.
 */
export async function idempotent<T>(
  tx: Tx,
  requestId: string,
  tool: string,
  args: unknown,
  run: () => Promise<T>,
  shouldStore: (result: T) => boolean = () => true,
): Promise<{ result: T; replayed: boolean }> {
  const hash = sha256(`${tool}:${stable(args)}`);
  // Serialize concurrent retries of the same request id.
  await tx`select pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ${requestId}, 0))`;
  const [prev] = await tx<{ tool: string; request_hash: string; response: T }[]>`
    select tool, request_hash, response from mcp_requests where request_id = ${requestId}`;
  if (prev) {
    if (prev.request_hash !== hash || prev.tool !== tool)
      throw new AppError('This request_id was already used for a different request. Use a new request_id for a new log.', 409);
    return { result: prev.response, replayed: true };
  }
  const result = await run();
  if (!shouldStore(result)) return { result, replayed: false };
  await tx`insert into mcp_requests (request_id, tool, request_hash, response) values (${requestId}, ${tool}, ${hash}, ${tx.json(result as never)})`;
  return { result, replayed: false };
}
