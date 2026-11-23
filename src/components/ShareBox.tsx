'use client';
import { useState } from 'react';
import { shareAction } from '@/app/actions';
import { useAction } from './useAction';
import { ErrorText } from './ui';

/** Send a copy of one item to another account. Only that item (and what it needs) is shared. */
export function ShareBox({
  type,
  id,
  recipients,
}: {
  type: 'food' | 'meal' | 'recipe';
  id: string;
  recipients: { user_id: string; display_name: string }[];
}) {
  const { run, pending, error } = useAction();
  const [to, setTo] = useState(recipients[0]?.user_id ?? '');
  const [sent, setSent] = useState(false);
  if (recipients.length === 0) return null;
  return (
    <section className="card mt-4 space-y-2 p-4">
      <h2 className="section-title">Share a copy</h2>
      <p className="text-[13px] text-muted">
        They get their own editable copy of this {type}
        {type !== 'food' ? ' and its ingredients' : ''}. Your diary, goals and weight are never shared.
      </p>
      {sent ? (
        <p className="text-sm font-medium text-good">Sent ✓ They can accept it in Settings.</p>
      ) : (
        <div className="flex gap-2">
          <select aria-label="Share with" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {recipients.map((r) => (
              <option key={r.user_id} value={r.user_id}>
                {r.display_name}
              </option>
            ))}
          </select>
          <button
            className="btn shrink-0"
            disabled={pending || !to}
            onClick={() =>
              run(
                () => shareAction({ type, id, recipient_id: to }),
                () => setSent(true),
              )
            }
          >
            Send copy
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </section>
  );
}
