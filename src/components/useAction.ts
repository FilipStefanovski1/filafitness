'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/app/actions';

/** Run a server action with pending/error state. Disables double submits while pending. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) {
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else if (onOk) onOk(r.data);
      else router.refresh();
    });
  }
  return { run, pending, error, setError };
}
