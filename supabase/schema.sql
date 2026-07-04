-- Folio — optional cloud sync schema
-- Folio works fully offline with IndexedDB by default (see js/db.js).
-- Run this in a Supabase project only if you want cross-device sync;
-- see README.md "Adding cloud sync" for the small amount of wiring needed
-- in js/app.js once this table exists.

create table if not exists public.files (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('doc', 'sheet', 'slide')),
  title text not null default 'Untitled',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists files_user_id_idx on public.files (user_id);
create index if not exists files_updated_at_idx on public.files (updated_at desc);

alter table public.files enable row level security;

drop policy if exists "Users can view own files" on public.files;
create policy "Users can view own files"
  on public.files for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own files" on public.files;
create policy "Users can insert own files"
  on public.files for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own files" on public.files;
create policy "Users can update own files"
  on public.files for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own files" on public.files;
create policy "Users can delete own files"
  on public.files for delete
  using (auth.uid() = user_id);

-- Keep updated_at accurate on every write.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at
  before update on public.files
  for each row execute function public.set_updated_at();
