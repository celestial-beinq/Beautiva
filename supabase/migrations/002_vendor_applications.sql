-- ============================================================================
-- 002: Vendor Applications & Self-Service Onboarding Workflow
-- ============================================================================

create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  application_number text unique not null,
  owner_name text not null,
  email text not null,
  phone text not null default '',
  business_name text not null,
  slug text not null,
  category_slug text not null,
  category_label text not null,
  city text not null default 'Lagos',
  location text not null,
  address text not null default '',
  tagline text not null default '',
  about text not null default '',
  instagram text not null default '',
  cover_image text not null default 'images/hero-salon.jpg',
  starting_service_name text not null default 'Signature Session',
  starting_service_price numeric(12,2) not null default 20000,
  starting_service_duration_minutes integer not null default 60,
  onboarding_fee numeric(12,2) not null default 25000,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'paid_live')),
  admin_note text,
  paystack_reference text,
  paid_at timestamptz,
  issued_login_email text,
  issued_temp_password text,
  live_business_slug text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_vendor_apps_number on public.vendor_applications(upper(application_number));
create index if not exists idx_vendor_apps_status on public.vendor_applications(status);

alter table public.vendor_applications enable row level security;

drop policy if exists "Public submit vendor application" on public.vendor_applications;
create policy "Public submit vendor application"
on public.vendor_applications for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "Super admin read all vendor applications" on public.vendor_applications;
create policy "Super admin read all vendor applications"
on public.vendor_applications for select
to authenticated
using (private.is_super_admin());

drop policy if exists "Super admin update vendor applications" on public.vendor_applications;
create policy "Super admin update vendor applications"
on public.vendor_applications for update
to authenticated
using (private.is_super_admin())
with check (private.is_super_admin());

-- Allow Super Admin to configure platform-wide vendor onboarding fee
alter table public.platform_settings
  add column if not exists vendor_onboarding_fee numeric(12,2) not null default 25000;
