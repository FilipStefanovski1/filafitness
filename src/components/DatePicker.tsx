'use client';
import { useRouter } from 'next/navigation';

/** Tappable day label that opens the native date picker. */
export function DatePicker({ date, label, basePath = '/' }: { date: string; label: string; basePath?: string }) {
  const router = useRouter();
  return (
    <label className="relative flex min-h-12 cursor-pointer items-center gap-1 px-2 text-lg font-bold">
      {label}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <input
        type="date"
        aria-label="Choose date"
        value={date}
        onChange={(e) => e.target.value && router.push(`${basePath}?date=${e.target.value}`)}
        className="absolute inset-0 opacity-0"
      />
    </label>
  );
}
