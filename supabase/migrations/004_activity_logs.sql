-- ============================================================================
-- 004: Platform Activity & Transaction Audit Logs
-- ============================================================================

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  category text not null default 'system',
  actor_name text not null default 'System',
  actor_email text,
  actor_role text not null default 'system',
  entity_type text,
  entity_id text,
  entity_name text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_logs_created on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_category on public.activity_logs(category);

alter table public.activity_logs enable row level security;

drop policy if exists "Super admin read activity logs" on public.activity_logs;
create policy "Super admin read activity logs"
on public.activity_logs for select
to authenticated
using (private.is_super_admin());

drop policy if exists "Insert activity logs" on public.activity_logs;
create policy "Insert activity logs"
on public.activity_logs for insert
to anon, authenticated
with check (true);

