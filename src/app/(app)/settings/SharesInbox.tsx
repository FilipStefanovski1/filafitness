'use client';
import { acceptShareAction, declineShareAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText } from '@/components/ui';

export function SharesInbox({ shares }: { shares: { id: string; type: string; name: string; from: string; at: string }[] }) {
  const { run, pending, error } = useAction();
  return (
    <section className="card border-accent p-4">
      <h2 className="section-title mb-2">Shared with you</h2>
      <ul className="space-y-3">
        {shares.map((s) => (
          <li key={s.id}>
            <div className="font-medium">
              {s.name} <span className="chip bg-line text-muted">{s.type}</span>
            </div>
            <div className="text-[12px] text-muted">from {s.from}. Accepting adds your own editable copy.</div>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary flex-1" disabled={pending} onClick={() => run(() => acceptShareAction(s.id))}>
                Add to my library
              </button>
              <button className="btn" disabled={pending} onClick={() => run(() => declineShareAction(s.id))}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </section>
  );
}
