'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const items = [
  { href: '/', label: 'Today', icon: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z' },
  { href: '/library', label: 'Library', icon: 'M5 4h4v16H5zM11 4h4v16h-4zM17.2 4.6l3.6 1.2-4.8 14.4-3.6-1.2z' },
  { href: '/add', label: 'Add', icon: '' },
  { href: '/weight', label: 'Weight', icon: 'M6 20h12l-1.6-11H7.6zM9.5 9a2.5 2.5 0 0 1 5 0M12 13v3' },
  { href: '/settings', label: 'More', icon: 'M5 7h14M5 12h14M5 17h14' },
];

export function BottomNav() {
  const path = usePathname();
  const sp = useSearchParams();
  const date = sp.get('date');
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          if (it.href === '/add')
            return (
              <li key={it.href} className="flex justify-center">
                <Link
                  href={date ? `/add?date=${date}` : '/add'}
                  aria-label="Add food"
                  className="-mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 active:scale-95"
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </Link>
              </li>
            );
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? 'text-ink' : 'text-muted'}`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  <path d={it.icon} />
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
