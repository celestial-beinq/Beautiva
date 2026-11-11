-- ============================================================================
-- 003: Configurable Vendor Onboarding Fee on platform_settings
-- ============================================================================
alter table public.platform_settings
  add column if not exists vendor_onboarding_fee numeric(12,2) not null default 25000;
