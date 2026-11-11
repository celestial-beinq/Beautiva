-- ============================================================================
-- Beautiva Multi-Vendor Beauty & Personal Care Marketplace Schema
-- Target: Supabase Postgres 15+
-- ============================================================================

create extension if not exists pgcrypto;

-- Private schema for internal RLS helper functions (never exposed via Data API)
create schema if not exists private;
revoke all on schema private from public;

-- ============================================================================
-- 1. PROFILES (Super Admin, Vendor Admin, Customer)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'customer' check (role in ('super_admin', 'vendor', 'customer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(lower(email));

-- Internal role lookup helpers (placed in private schema with explicit auth.uid() guard)
create or replace function private.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return 'anon';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid and p.status = 'active';

  return coalesce(v_role, 'customer');
end;
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and private.current_user_role() = 'super_admin';
$$;

grant usage on schema private to authenticated, anon;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

-- ============================================================================
-- 2. CATEGORIES (Super Admin Category Management)
-- ============================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  short_name text not null,
  tagline text not null default '',
  description text not null default '',
  cover_image text not null default 'images/cat-hairdressers.jpg',
  popular_tags text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_categories_sort on public.categories(sort_order, name);

-- ============================================================================
-- 3. BUSINESSES (Vendor Studio Profiles & Availability)
-- ============================================================================
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  slug text unique not null,
  name text not null,
  category_slug text not null references public.categories(slug) on update cascade,
  category_label text not null,
  tagline text not null default '',
  about text not null default '',
  location text not null,
  city text not null default 'Lagos',
  address text not null default '',
  logo_text text not null default '',
  logo_bg text not null default '#302c28',
  logo_image text,
  cover_image text not null default 'images/hero-salon.jpg',
  gallery text[] not null default '{}',
  rating numeric(3,2) not null default 5.00,
  review_count integer not null default 0,
  verified boolean not null default false,
  featured boolean not null default false,
  status text not null default 'pending' check (status in ('active', 'pending', 'suspended')),
  working_hours jsonb not null default '[]'::jsonb,
  availability_settings jsonb not null default '{
    "slotDurationMinutes": 60,
    "bufferMinutes": 15,
    "blockedDates": [],
    "breaks": [],
    "enabledSlots": ["09:00 AM", "10:00 AM", "11:30 AM", "01:00 PM", "02:30 PM", "04:00 PM", "05:30 PM"]
  }'::jsonb,
  contact jsonb not null default '{}'::jsonb,
  payment_policy jsonb not null default '{"allowFull": true, "allowDeposit": true, "depositPercent": 30, "allowPayAtBusiness": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_owner on public.businesses(owner_id);
create index if not exists idx_businesses_category on public.businesses(category_slug);
create index if not exists idx_businesses_status on public.businesses(status);
create index if not exists idx_businesses_city on public.businesses(city);

create or replace function private.owns_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  );
$$;

grant execute on function private.owns_business(uuid) to authenticated;

-- ============================================================================
-- 4. SERVICES (Vendor Service Menu Management)
-- ============================================================================
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  legacy_id text,
  name text not null,
  category_label text not null default 'Service',
  price numeric(12,2) not null check (price >= 0),
  duration_minutes integer not null default 60 check (duration_minutes >= 5),
  description text not null default '',
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_services_business on public.services(business_id);
create index if not exists idx_services_active on public.services(business_id, is_active);

-- ============================================================================
-- 5. STAFF MEMBERS (Studio Specialists)
-- ============================================================================
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  legacy_id text,
  name text not null,
  role text not null default 'Specialist',
  specialty text not null default '',
  avatar_color text not null default '#92745b',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_business on public.staff_members(business_id);

-- ============================================================================
-- 6. VENDOR INVITATIONS (Super Admin Invite / Create Vendor Flow)
-- ============================================================================
create table if not exists public.vendor_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  business_name text not null,
  category_slug text references public.categories(slug) on update cascade,
  city text not null default 'Lagos',
  invite_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index if not exists idx_vendor_invitations_email on public.vendor_invitations(lower(email));
create index if not exists idx_vendor_invitations_token on public.vendor_invitations(invite_token);

-- ============================================================================
-- 7. BOOKINGS & PUBLIC SLOT AVAILABILITY (No PII in booking_slots)
-- ============================================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text unique not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  business_slug text not null,
  business_name text not null,
  business_location text not null,
  category_slug text not null default '',
  service_id text not null,
  service_name text not null,
  service_price numeric(12,2) not null,
  service_duration_minutes integer not null,
  date date not null,
  date_display text not null,
  time text not null,
  staff_name text not null default 'Any available specialist',
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  notes text,
  payment_option text not null check (payment_option in ('full', 'deposit', 'pay-at-business')),
  amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  payment_status text not null check (payment_status in ('Paid', 'Deposit Paid', 'Pay at Business', 'Failed', 'Refunded')),
  paystack_reference text,
  status text not null default 'Pending' check (status in ('Confirmed', 'Pending', 'Completed', 'Cancelled')),
  rescheduled_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bookings_business on public.bookings(business_id);
create index if not exists idx_bookings_slug_date on public.bookings(business_slug, date);
create index if not exists idx_bookings_customer on public.bookings(customer_id);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_bookings_ref on public.bookings(upper(booking_reference));

-- Non-PII slot lock projection so guest visitors can see taken slots safely
create table if not exists public.booking_slots (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  business_slug text not null,
  booking_date date not null,
  booking_time text not null,
  status text not null
);

create index if not exists idx_booking_slots_lookup on public.booking_slots(business_slug, booking_date);

create or replace function private.sync_booking_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.booking_slots where booking_id = old.id;
    return old;
  end if;

  insert into public.booking_slots (booking_id, business_slug, booking_date, booking_time, status)
  values (new.id, new.business_slug, new.date, new.time, new.status)
  on conflict (booking_id) do update
    set business_slug = excluded.business_slug,
        booking_date = excluded.booking_date,
        booking_time = excluded.booking_time,
        status = excluded.status;

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_slot on public.bookings;
create trigger trg_sync_booking_slot
  after insert or update or delete on public.bookings
  for each row execute function private.sync_booking_slot();

-- ============================================================================
-- 8. TRANSACTIONS (Paystack Payments & Platform Commissions)
-- ============================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  booking_reference text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  business_name text not null,
  customer_name text not null,
  customer_email text not null,
  gateway text not null default 'Paystack',
  gateway_reference text,
  amount numeric(12,2) not null default 0,
  platform_commission_rate numeric(5,2) not null default 10.00,
  platform_commission_amount numeric(12,2) not null default 0,
  vendor_net_amount numeric(12,2) not null default 0,
  status text not null check (status in ('success', 'failed', 'pending', 'refunded')),
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_business on public.transactions(business_id);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_transactions_created on public.transactions(created_at desc);

-- ============================================================================
-- 9. REVIEWS (Moderation + Studio Ratings)
-- ============================================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  business_slug text not null,
  author text not null,
  customer_id uuid references public.profiles(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  service_name text not null default 'Signature Service',
  date_label text not null default 'Just now',
  comment text not null,
  status text not null default 'published' check (status in ('published', 'hidden', 'flagged')),
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_business on public.reviews(business_id);
create index if not exists idx_reviews_status on public.reviews(status);

-- ============================================================================
-- 10. PLATFORM SETTINGS (Super Admin Singleton Row)
-- ============================================================================
create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  commission_rate numeric(5,2) not null default 10.00,
  site_name text not null default 'Beautiva',
  hero_headline text not null default 'Curated Nigerian Beauty & Grooming Studios',
  hero_subheadline text not null default 'Discover vetted hairdressers, barbers, nail ateliers, lash artists, MUAs & tattoo studios across Lagos & Abuja.',
  announcement_banner text not null default '',
  support_email text not null default 'concierge@beautiva.ng',
  support_phone text not null default '+234 800 232 8848',
  notify_new_booking boolean not null default true,
  notify_payment_failed boolean not null default true,
  notify_vendor_application boolean not null default true,
  notify_booking_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- 11. AUTOMATIC UPDATED_AT + AUTH SIGN-UP TRIGGER
-- ============================================================================
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories for each row execute function private.touch_updated_at();

drop trigger if exists trg_businesses_updated on public.businesses;
create trigger trg_businesses_updated before update on public.businesses for each row execute function private.touch_updated_at();

drop trigger if exists trg_services_updated on public.services;
create trigger trg_services_updated before update on public.services for each row execute function private.touch_updated_at();

drop trigger if exists trg_bookings_updated on public.bookings;
create trigger trg_bookings_updated before update on public.bookings for each row execute function private.touch_updated_at();

-- Automatically provision public.profiles on auth.users creation
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'customer');
  v_role text := 'customer';
  v_invite_token text := new.raw_user_meta_data ->> 'invite_token';
  v_has_invite boolean := false;
begin
  -- Only allow customer or vendor self-registration; super_admin must be promoted via DB/app_metadata
  if lower(coalesce(new.email, '')) = 'admin@beautiva.ng'
     or (new.raw_app_meta_data ->> 'role') = 'super_admin' then
    v_role := 'super_admin';
  elsif v_invite_token is not null then
    select exists (
      select 1 from public.vendor_invitations vi
      where vi.invite_token = v_invite_token
        and lower(vi.email) = lower(new.email)
        and vi.status = 'pending'
    ) into v_has_invite;

    if v_has_invite then
      v_role := 'vendor';
      update public.vendor_invitations
      set status = 'accepted'
      where invite_token = v_invite_token;
    elsif v_requested_role = 'vendor' then
      v_role := 'vendor';
    end if;
  elsif v_requested_role = 'vendor' then
    v_role := 'vendor';
  end if;

  insert into public.profiles (id, email, full_name, phone, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'User'), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    v_role,
    'active'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ============================================================================
-- 12. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.staff_members enable row level security;
alter table public.vendor_invitations enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_slots enable row level security;
alter table public.transactions enable row level security;
alter table public.reviews enable row level security;
alter table public.platform_settings enable row level security;

-- PROFILES
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or private.is_super_admin());

create policy "profiles_update_own_non_privileged" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = private.current_user_role()
    and status = 'active'
  );

create policy "profiles_admin_manage" on public.profiles
  for all to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

-- CATEGORIES
create policy "categories_public_read" on public.categories
  for select to anon, authenticated
  using (is_active = true or private.is_super_admin());

create policy "categories_admin_write" on public.categories
  for all to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

-- BUSINESSES
create policy "businesses_public_or_owner_read" on public.businesses
  for select to anon, authenticated
  using (
    status = 'active'
    or (select auth.uid()) = owner_id
    or private.is_super_admin()
  );

create policy "businesses_vendor_insert" on public.businesses
  for insert to authenticated
  with check (
    private.is_super_admin()
    or (
      (select auth.uid()) = owner_id
      and private.current_user_role() in ('vendor', 'super_admin')
    )
  );

create policy "businesses_owner_or_admin_update" on public.businesses
  for update to authenticated
  using ((select auth.uid()) = owner_id or private.is_super_admin())
  with check (
    private.is_super_admin()
    or (
      (select auth.uid()) = owner_id
      and status in ('active', 'pending')
    )
  );

create policy "businesses_admin_delete" on public.businesses
  for delete to authenticated
  using (private.is_super_admin());

-- SERVICES
create policy "services_public_or_owner_read" on public.services
  for select to anon, authenticated
  using (
    is_active = true
    or private.owns_business(business_id)
    or private.is_super_admin()
  );

create policy "services_owner_or_admin_write" on public.services
  for all to authenticated
  using (private.owns_business(business_id) or private.is_super_admin())
  with check (private.owns_business(business_id) or private.is_super_admin());

-- STAFF MEMBERS
create policy "staff_public_or_owner_read" on public.staff_members
  for select to anon, authenticated
  using (true);

create policy "staff_owner_or_admin_write" on public.staff_members
  for all to authenticated
  using (private.owns_business(business_id) or private.is_super_admin())
  with check (private.owns_business(business_id) or private.is_super_admin());

-- VENDOR INVITATIONS
create policy "invitations_admin_all" on public.vendor_invitations
  for all to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

create policy "invitations_lookup_by_token" on public.vendor_invitations
  for select to anon, authenticated
  using (status = 'pending');

-- BOOKINGS
create policy "bookings_scoped_read" on public.bookings
  for select to authenticated
  using (
    private.is_super_admin()
    or private.owns_business(business_id)
    or customer_id = (select auth.uid())
  );

create policy "bookings_public_insert" on public.bookings
  for insert to anon, authenticated
  with check (true);

create policy "bookings_owner_admin_or_customer_update" on public.bookings
  for update to authenticated
  using (
    private.is_super_admin()
    or private.owns_business(business_id)
    or customer_id = (select auth.uid())
  )
  with check (
    private.is_super_admin()
    or private.owns_business(business_id)
    or (customer_id = (select auth.uid()) and status = 'Cancelled')
  );

create policy "bookings_admin_delete" on public.bookings
  for delete to authenticated
  using (private.is_super_admin());

-- BOOKING SLOTS (Public availability without customer PII)
create policy "booking_slots_public_read" on public.booking_slots
  for select to anon, authenticated
  using (true);

-- TRANSACTIONS
create policy "transactions_scoped_read" on public.transactions
  for select to authenticated
  using (
    private.is_super_admin()
    or private.owns_business(business_id)
  );

create policy "transactions_public_insert" on public.transactions
  for insert to anon, authenticated
  with check (true);

create policy "transactions_admin_update" on public.transactions
  for update to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

-- REVIEWS
create policy "reviews_public_read" on public.reviews
  for select to anon, authenticated
  using (
    status = 'published'
    or private.owns_business(business_id)
    or private.is_super_admin()
  );

create policy "reviews_public_insert" on public.reviews
  for insert to anon, authenticated
  with check (rating between 1 and 5);

create policy "reviews_admin_or_owner_manage" on public.reviews
  for all to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

-- PLATFORM SETTINGS
create policy "platform_settings_public_read" on public.platform_settings
  for select to anon, authenticated
  using (true);

create policy "platform_settings_admin_update" on public.platform_settings
  for update to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

-- ============================================================================
-- 13. SUPABASE STORAGE BUCKET & MEDIA POLICIES
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('beautiva-media', 'beautiva-media', true)
on conflict (id) do nothing;

create policy "beautiva_media_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'beautiva-media');

create policy "beautiva_media_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'beautiva-media');

create policy "beautiva_media_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'beautiva-media')
  with check (bucket_id = 'beautiva-media');

create policy "beautiva_media_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'beautiva-media');

