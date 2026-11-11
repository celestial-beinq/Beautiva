-- ============================================================================
-- 005: Super Admin Vendor Credentials Vault
-- ============================================================================
-- Stores Super Admin-provisioned / reset vendor login emails & passwords
-- separately from public.businesses so anonymous marketplace queries never
-- read vendor credentials.
-- ============================================================================

create table if not exists public.vendor_credentials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid unique references public.businesses(id) on delete cascade,
  business_slug text unique not null,
  email text not null,
  temp_password text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_credentials_slug on public.vendor_credentials(business_slug);
create index if not exists idx_vendor_credentials_email on public.vendor_credentials(email);

alter table public.vendor_credentials enable row level security;

drop policy if exists "Super admin manage vendor credentials" on public.vendor_credentials;
create policy "Super admin manage vendor credentials"
on public.vendor_credentials for all
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

-- Backfill from paid onboarding applications
insert into public.vendor_credentials (business_id, business_slug, email, temp_password, updated_at)
select
  b.id,
  coalesce(nullif(va.live_business_slug, ''), va.slug),
  coalesce(nullif(va.issued_login_email, ''), va.email),
  va.issued_temp_password,
  coalesce(va.paid_at, va.created_at, now())
from public.vendor_applications va
left join public.businesses b
  on b.slug = coalesce(nullif(va.live_business_slug, ''), va.slug)
where va.status = 'paid_live'
  and va.issued_temp_password is not null
  and va.issued_temp_password <> ''
on conflict (business_slug) do update set
  business_id = coalesce(excluded.business_id, public.vendor_credentials.business_id),
  email = excluded.email,
  temp_password = excluded.temp_password,
  updated_at = excluded.updated_at;

