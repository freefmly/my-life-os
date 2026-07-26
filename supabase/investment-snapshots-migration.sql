-- Run this once in Supabase Dashboard > SQL Editor, before deploying the updated function.
-- Snapshot history is stored independently from the main life_app_states JSON document.

create table if not exists public.investment_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('soxl', 'tqqq-vr', 'family-account', 'business-balance')),
  account_id text not null default '',
  snapshot_key text not null,
  captured_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, snapshot_type, account_id, snapshot_key)
);

create index if not exists investment_snapshots_user_captured_at_idx
  on public.investment_snapshots (user_id, captured_at desc);

alter table public.investment_snapshots enable row level security;

drop policy if exists "Users can read their own investment snapshots" on public.investment_snapshots;
create policy "Users can read their own investment snapshots"
  on public.investment_snapshots for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own investment snapshots" on public.investment_snapshots;
create policy "Users can create their own investment snapshots"
  on public.investment_snapshots for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own investment snapshots" on public.investment_snapshots;
create policy "Users can update their own investment snapshots"
  on public.investment_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own investment snapshots" on public.investment_snapshots;
create policy "Users can delete their own investment snapshots"
  on public.investment_snapshots for delete using (auth.uid() = user_id);

-- Copy all existing history. It is safe to rerun because the primary key makes this idempotent.
insert into public.investment_snapshots (user_id, snapshot_type, account_id, snapshot_key, captured_at, payload)
select state.user_id, 'soxl', '', left(snapshot->>'date', 10), (snapshot->>'date')::timestamptz, snapshot
from public.life_app_states state
cross join lateral jsonb_array_elements(coalesce(state.data #> '{investments,soxl,snapshots}', '[]'::jsonb)) snapshot
where snapshot ? 'date'
on conflict (user_id, snapshot_type, account_id, snapshot_key) do update
  set captured_at = excluded.captured_at, payload = excluded.payload;

insert into public.investment_snapshots (user_id, snapshot_type, account_id, snapshot_key, captured_at, payload)
select state.user_id, 'tqqq-vr', '', left(snapshot->>'date', 10), (snapshot->>'date')::timestamptz, snapshot
from public.life_app_states state
cross join lateral jsonb_array_elements(coalesce(state.data #> '{investments,tqqqVr,snapshots}', '[]'::jsonb)) snapshot
where snapshot ? 'date'
on conflict (user_id, snapshot_type, account_id, snapshot_key) do update
  set captured_at = excluded.captured_at, payload = excluded.payload;

insert into public.investment_snapshots (user_id, snapshot_type, account_id, snapshot_key, captured_at, payload)
select state.user_id, 'family-account', account.key, left(snapshot->>'date', 10), (snapshot->>'date')::timestamptz, snapshot
from public.life_app_states state
cross join lateral jsonb_each(coalesce(state.data #> '{investments,familyAccounts}', '{}'::jsonb)) account
cross join lateral jsonb_array_elements(coalesce(account.value->'snapshots', '[]'::jsonb)) snapshot
where snapshot ? 'date'
on conflict (user_id, snapshot_type, account_id, snapshot_key) do update
  set captured_at = excluded.captured_at, payload = excluded.payload;

insert into public.investment_snapshots (user_id, snapshot_type, account_id, snapshot_key, captured_at, payload)
select state.user_id, 'business-balance', '', snapshot->>'month', coalesce((snapshot->>'savedAt')::timestamptz, now()), snapshot
from public.life_app_states state
cross join lateral jsonb_array_elements(coalesce(state.data->'businessSnapshots', '[]'::jsonb)) snapshot
where snapshot ? 'month'
on conflict (user_id, snapshot_type, account_id, snapshot_key) do update
  set captured_at = excluded.captured_at, payload = excluded.payload;
