import { redirect } from 'next/navigation';
import { currentUserId } from '@/server/auth';
import { SetPassword } from './SetPassword';

export default async function SetPasswordPage() {
  if (!(await currentUserId())) redirect('/login');
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <h1 className="h1 mb-2">Choose a password</h1>
      <p className="mb-6 text-muted">You’ll use it with your email to sign in on your phone.</p>
      <SetPassword />
    </main>
  );
}
