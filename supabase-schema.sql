-- Run this once in Supabase Dashboard > SQL Editor.
-- Each signed-in user can read and write only their own app state.

create table if not exists public.life_app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.life_app_states enable row level security;

drop policy if exists "Users can read their own life state" on public.life_app_states;
create policy "Users can read their own life state"
  on public.life_app_states for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own life state" on public.life_app_states;
create policy "Users can create their own life state"
  on public.life_app_states for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own life state" on public.life_app_states;
create policy "Users can update their own life state"
  on public.life_app_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
