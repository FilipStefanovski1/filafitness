'use client';
import { useState } from 'react';
import { createTokenAction, revokeTokenAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText } from '@/components/ui';

interface Tok {
  id: string;
  name: string;
  kind: string;
  prefix: string;
  last_used: string | null;
  created: string;
}

export function McpTokens({ mcpUrl, tokens }: { mcpUrl: string; tokens: Tok[] }) {
  const { run, pending, error } = useAction();
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <section className="card space-y-3 p-4">
      <h2 className="section-title">Connect ChatGPT or Claude (MCP)</h2>
      <p className="text-[13px] text-muted">
        Lets an assistant search your foods and log to <b>your</b> diary only. You sign in to approve it; the assistant never chooses whose
        diary it writes to.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          aria-label="MCP server URL"
          className="input font-mono text-[13px]"
          value={mcpUrl}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="btn shrink-0" onClick={() => copy(mcpUrl, 'url')}>
          {copied === 'url' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <details className="rounded-xl bg-paper p-3 text-[13px]">
        <summary className="cursor-pointer font-semibold">How to connect</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            <b>ChatGPT</b>: Settings → Apps &amp; Connectors → Advanced settings → turn on Developer mode. Then Create (custom connector),
            paste the URL above, choose OAuth, and sign in here when asked.
          </li>
          <li>
            <b>Claude</b>: Settings → Connectors → Add custom connector, paste the URL, then sign in here.
          </li>
          <li>
            <b>Other MCP clients</b> (Claude Code, Inspector): create a personal token below and send it as{' '}
            <code>Authorization: Bearer …</code>.
          </li>
        </ol>
        <p className="mt-2 text-muted">
          Each person connects from their own ChatGPT/Claude account and signs in with their own FilaFitness login.
        </p>
      </details>

      <ul className="divide-y divide-line">
        {tokens.map((t) => (
          <li key={t.id} className="flex min-h-12 items-center gap-2 py-1">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.name}</div>
              <div className="text-[11px] text-muted">
                {t.kind === 'pat' ? 'personal token' : 'OAuth connection'} · {t.prefix}… ·{' '}
                {t.last_used ? `used ${new Date(t.last_used).toLocaleDateString()}` : 'never used'}
              </div>
            </div>
            <button
              className="btn min-h-10 px-3 text-sm text-warn"
              disabled={pending}
              onClick={() => confirm(`Disconnect “${t.name}”?`) && run(() => revokeTokenAction(t.id))}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>

      {fresh ? (
        <div className="space-y-2 rounded-xl bg-warn-bg p-3">
          <p className="text-[13px] font-semibold text-warn">Copy this token now. It won’t be shown again.</p>
          <div className="flex gap-2">
            <input
              readOnly
              aria-label="New token"
              className="input font-mono text-[12px]"
              value={fresh}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="btn shrink-0" onClick={() => copy(fresh, 'tok')}>
              {copied === 'tok' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" className="btn-ghost w-full text-sm" onClick={() => setFresh(null)}>
            Done
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            aria-label="Token name"
            className="input"
            placeholder="Token name, e.g. Claude Code"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn shrink-0"
            disabled={pending}
            onClick={() =>
              run(
                () => createTokenAction(name || 'MCP client'),
                (tok) => {
                  setFresh(tok);
                  setName('');
                },
              )
            }
          >
            Create token
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </section>
  );
}
