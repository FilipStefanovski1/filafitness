import { Suspense } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { requireUser } from '@/server/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      {children}
      <Suspense>
        <BottomNav />
      </Suspense>
    </>
  );
}
