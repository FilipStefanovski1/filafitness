-- Daily water intake (one running total per local date) and a per-user water goal.
alter table public.profiles add column water_target_ml integer not null default 2000 check (water_target_ml between 0 and 10000);

create table public.water_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  ml integer not null default 0 check (ml between 0 and 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
create trigger water_days_touch before update on public.water_days for each row execute function public.touch_updated_at();
alter table public.water_days enable row level security;
revoke all on public.water_days from anon;
create policy water_days_own on public.water_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
