-- FilaFitness core schema.
-- Every user-owned table has RLS keyed on auth.uid(). The app and the MCP server
-- both run their queries as the `authenticated` role with the verified user's id
-- in request.jwt.claims, so these policies are the single source of truth for privacy.

create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snacks');
create type public.nutrition_basis as enum ('per_100g', 'per_100ml', 'per_serving');
create type public.food_state as enum ('raw', 'dry', 'cooked');
create type public.item_source as enum ('manual', 'label', 'gpt_estimate', 'quick_add', 'starter', 'shared', 'demo', 'open_food_facts', 'diary');
create type public.entry_kind as enum ('food', 'meal', 'recipe', 'quick', 'estimate');
create type public.yield_unit as enum ('g', 'servings');
create type public.share_item as enum ('food', 'meal', 'recipe');
create type public.share_status as enum ('pending', 'accepted', 'declined');

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  timezone text not null default 'Europe/Skopje',
  kcal_target numeric not null default 2000 check (kcal_target > 0 and kcal_target < 20000),
  protein_target_g numeric not null default 100 check (protein_target_g >= 0 and protein_target_g < 1000),
  carbs_target_g numeric check (carbs_target_g >= 0),
  fat_target_g numeric check (fat_target_g >= 0),
  goal_weight_kg numeric check (goal_weight_kg > 0 and goal_weight_kg < 500),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Create a profile for each invited user. Optional starting targets can be passed
-- in the invite's user metadata (see scripts/invite.ts); they only prefill onboarding.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (user_id, display_name, kcal_target, protein_target_g, goal_weight_kg, timezone)
  values (
    new.id,
    coalesce(m ->> 'display_name', split_part(new.email, '@', 1), ''),
    coalesce((m ->> 'kcal_target')::numeric, 2000),
    coalesce((m ->> 'protein_target_g')::numeric, 100),
    (m ->> 'goal_weight_kg')::numeric,
    coalesce(m ->> 'timezone', 'Europe/Skopje')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- foods
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 200),
  brand text,
  barcode text,
  aliases text[] not null default '{}',
  search_key text not null default '',
  basis public.nutrition_basis not null,
  serving_label text,          -- what one labeled serving is called, e.g. "scoop"
  serving_grams numeric check (serving_grams > 0),
  serving_ml numeric check (serving_ml > 0),
  grams_per_ml numeric check (grams_per_ml > 0),
  kcal numeric not null check (kcal >= 0),   -- per basis quantity
  protein_g numeric check (protein_g >= 0),  -- null = unknown
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  units jsonb not null default '[]'::jsonb check (jsonb_typeof(units) = 'array'),
  default_amount numeric not null default 100 check (default_amount > 0),
  default_unit text not null default 'g',
  state public.food_state,
  source public.item_source not null default 'manual',
  source_label text,
  assumptions text,
  notes text,
  is_favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index foods_user_idx on public.foods (user_id, archived);
create index foods_search_idx on public.foods (user_id, search_key);
create trigger foods_touch before update on public.foods for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- recipes
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 200),
  aliases text[] not null default '{}',
  search_key text not null default '',
  yield_unit public.yield_unit not null,
  yield_amount numeric not null check (yield_amount > 0),
  yield_estimated boolean not null default false,
  serving_grams numeric check (serving_grams > 0), -- for servings-yield recipes, if a serving's weight is known
  default_amount numeric not null default 1 check (default_amount > 0),
  default_unit text not null default 'serving',
  state public.food_state default 'cooked',
  source public.item_source not null default 'manual',
  source_label text,
  notes text,
  is_favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_user_idx on public.recipes (user_id, archived);
create trigger recipes_touch before update on public.recipes for each row execute function public.touch_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position int not null default 0,
  food_id uuid not null references public.foods (id) on delete restrict,
  amount numeric not null check (amount > 0),
  unit text not null
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

-- ---------------------------------------------------------------- meals
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 200),
  aliases text[] not null default '{}',
  search_key text not null default '',
  default_slot public.meal_slot,
  source public.item_source not null default 'manual',
  source_label text,
  notes text,
  is_favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meals_user_idx on public.meals (user_id, archived);
create trigger meals_touch before update on public.meals for each row execute function public.touch_updated_at();

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position int not null default 0,
  food_id uuid references public.foods (id) on delete restrict,
  recipe_id uuid references public.recipes (id) on delete restrict,
  amount numeric not null check (amount > 0),
  unit text not null,
  check ((food_id is null) <> (recipe_id is null))
);
create index meal_items_meal_idx on public.meal_items (meal_id, position);

-- ---------------------------------------------------------------- diary
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  slot public.meal_slot not null,
  logged_at timestamptz not null default now(),
  kind public.entry_kind not null,
  name text not null check (length(btrim(name)) > 0),
  source_id uuid,          -- food / meal / recipe id it was logged from (no FK: entries outlive library items)
  amount numeric check (amount > 0),
  unit text,
  -- Totals of the components at log time. Macros are the sum of KNOWN component values;
  -- `missing` lists macros where at least one component is unknown (null = none known).
  kcal numeric not null check (kcal >= 0),
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  missing text[] not null default '{}',
  is_estimate boolean not null default false,
  source_label text,
  assumptions text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index diary_entries_user_date_idx on public.diary_entries (user_id, local_date, slot);
create index diary_entries_recent_idx on public.diary_entries (user_id, logged_at desc);
create trigger diary_entries_touch before update on public.diary_entries for each row execute function public.touch_updated_at();

create table public.diary_components (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.diary_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position int not null default 0,
  name text not null,
  food_id uuid,
  recipe_id uuid,
  amount numeric check (amount > 0),
  unit text,
  kcal numeric not null check (kcal >= 0),
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  missing text[] not null default '{}',
  -- Full nutrition spec used for this component at log time, so the entry can be
  -- re-portioned later without reading the (possibly edited) library item.
  snapshot jsonb not null
);
create index diary_components_entry_idx on public.diary_components (entry_id, position);

-- ---------------------------------------------------------------- weight
create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  weight_kg numeric not null check (weight_kg >= 20 and weight_kg <= 400),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
create trigger weigh_ins_touch before update on public.weigh_ins for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- sharing
-- A share is a self-contained copy of one food, meal, or recipe (payload). Accepting
-- it creates independent copies in the recipient's library. Diary, goals and weight
-- are never part of a payload.
create table public.shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  item_type public.share_item not null,
  item_name text not null,
  payload jsonb not null,
  status public.share_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);
create index shares_recipient_idx on public.shares (recipient_id, status);

create or replace function public.shares_guard() returns trigger
language plpgsql as $$
begin
  if new.payload is distinct from old.payload or new.sender_id <> old.sender_id
     or new.recipient_id <> old.recipient_id or new.item_type <> old.item_type then
    raise exception 'share contents are immutable';
  end if;
  return new;
end $$;
create trigger shares_guard before update on public.shares for each row execute function public.shares_guard();

-- Names of the other accounts, for choosing a share recipient. Exposes nothing else.
create or replace function public.share_recipients()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.display_name from public.profiles p
  where auth.uid() is not null and p.user_id <> auth.uid() and p.onboarded
  order by p.display_name;
$$;
revoke all on function public.share_recipients() from public, anon;
grant execute on function public.share_recipients() to authenticated;

-- ---------------------------------------------------------------- API access (MCP)
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('pat', 'oauth_access', 'oauth_refresh')),
  token_hash text not null unique,
  token_prefix text not null,
  client_id text,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_tokens_user_idx on public.api_tokens (user_id);

-- OAuth client registrations and authorization codes are only touched by the
-- server's privileged connection; no policies => no access for app roles.
create table public.oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);
create table public.oauth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Idempotency records for MCP writes: replaying a request_id returns the stored result.
create table public.mcp_requests (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request_id text not null check (length(request_id) between 8 and 200),
  tool text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.foods enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.diary_entries enable row level security;
alter table public.diary_components enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.shares enable row level security;
alter table public.api_tokens enable row level security;
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.mcp_requests enable row level security;

-- Nothing is readable anonymously.
revoke all on all tables in schema public from anon;

create policy profiles_own on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy foods_own on public.foods for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy recipes_own on public.recipes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy recipe_ingredients_own on public.recipe_ingredients for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid()))
    and exists (select 1 from public.foods f where f.id = food_id and f.user_id = (select auth.uid()))
  );

create policy meals_own on public.meals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy meal_items_own on public.meal_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.meals m where m.id = meal_id and m.user_id = (select auth.uid()))
    and (food_id is null or exists (select 1 from public.foods f where f.id = food_id and f.user_id = (select auth.uid())))
    and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())))
  );

create policy diary_entries_own on public.diary_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy diary_components_own on public.diary_components for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.diary_entries e where e.id = entry_id and e.user_id = (select auth.uid()))
  );

create policy weigh_ins_own on public.weigh_ins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy shares_select on public.shares for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy shares_insert on public.shares for insert to authenticated
  with check (sender_id = (select auth.uid()) and status = 'pending');
create policy shares_respond on public.shares for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy shares_delete on public.shares for delete to authenticated
  using (sender_id = (select auth.uid()) and status = 'pending');

create policy api_tokens_select on public.api_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy api_tokens_insert on public.api_tokens for insert to authenticated
  with check (user_id = (select auth.uid()) and kind = 'pat');
create policy api_tokens_update on public.api_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy api_tokens_delete on public.api_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

create policy mcp_requests_own on public.mcp_requests for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Users may rename or revoke their tokens, never rewrite hashes, kinds or owners.
revoke update on public.api_tokens from authenticated;
grant update (name, revoked_at) on public.api_tokens to authenticated;
