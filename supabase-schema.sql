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

-- Memory photos: a private bucket, with each user limited to their own folder.
-- The app stores a long-lived signed URL inside its RLS-protected app state.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-images', 'memory-images', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 6291456;

drop policy if exists "Users manage their memory images" on storage.objects;
create policy "Users manage their memory images"
  on storage.objects for all
  using (bucket_id = 'memory-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memory-images' and (storage.foldername(name))[1] = auth.uid()::text);
