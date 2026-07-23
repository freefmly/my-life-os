-- Run this once in Supabase Dashboard > SQL Editor.
-- Each signed-in user can read and write only their own app state.

create table if not exists public.life_app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.life_app_states enable row level security;

-- Deliver changes from another phone, PC, or browser to already-open sessions.
-- The existence check keeps this script safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'life_app_states'
  ) then
    alter publication supabase_realtime add table public.life_app_states;
  end if;
end $$;

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
-- The app stores only each object's path; short-lived signed URLs are generated in memory when needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-images', 'memory-images', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 6291456;

drop policy if exists "Users manage their memory images" on storage.objects;
drop policy if exists "Memory images: select own folder" on storage.objects;
drop policy if exists "Memory images: insert own folder" on storage.objects;
drop policy if exists "Memory images: update own folder" on storage.objects;
drop policy if exists "Memory images: delete own folder" on storage.objects;

-- Storage assigns owner_id from the logged-in user's JWT at upload time.
-- Upload is bucket-scoped; every later operation is owner-scoped.
create policy "Memory images: select own folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'memory-images' and owner_id = (select auth.uid()::text));

create policy "Memory images: insert own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'memory-images');

create policy "Memory images: update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'memory-images' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'memory-images' and owner_id = (select auth.uid()::text));

create policy "Memory images: delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'memory-images' and owner_id = (select auth.uid()::text));
