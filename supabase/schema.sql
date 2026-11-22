-- Run once in the Supabase SQL editor.
-- Row Level Security makes the publishable key in the app safe: each signed-in user can only
-- ever read and write their own row.

create table if not exists public.vault_sync_state (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vault_sync_state enable row level security;
alter table public.vault_sync_state force row level security;

drop policy if exists "owner can read"   on public.vault_sync_state;
drop policy if exists "owner can insert" on public.vault_sync_state;
drop policy if exists "owner can update" on public.vault_sync_state;
drop policy if exists "owner can delete" on public.vault_sync_state;

create policy "owner can read"   on public.vault_sync_state for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner can insert" on public.vault_sync_state for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner can update" on public.vault_sync_state for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner can delete" on public.vault_sync_state for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.vault_sync_state from anon;

-- Live updates between devices
alter publication supabase_realtime add table public.vault_sync_state;
