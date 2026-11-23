import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { todayIn } from '@/lib/dates';
import { ProfileForm } from '@/components/ProfileForm';

export default async function Onboarding() {
  const { profile } = await requireUser({ allowNotOnboarded: true });
  if (profile.onboarded) redirect('/');
  return (
    <main className="page">
      <h1 className="h1 mt-6">Welcome{profile.display_name ? `, ${profile.display_name}` : ''}</h1>
      <p className="mb-5 mt-1 text-muted">Set your own daily targets. You can change them any time in Settings. Nobody else sees them.</p>
      <div className="card p-4">
        <ProfileForm initial={profile} onboarding today={todayIn(profile.timezone)} />
      </div>
    </main>
  );
}
