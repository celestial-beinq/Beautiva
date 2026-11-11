-- ============================================================================
-- Beautiva Data Reset Script
-- Run this in the Supabase SQL Editor if you previously ran seed.sql and want
-- to wipe all marketplace data so the Super Admin can populate everything
-- fresh from the /admin dashboard.
-- (Preserves platform_settings row id=1 and auth/admin profiles.)
-- ============================================================================

delete from public.transactions;
delete from public.booking_slots;
delete from public.bookings;
delete from public.reviews;
delete from public.services;
delete from public.staff_members;
delete from public.vendor_invitations;
delete from public.vendor_applications;
delete from public.businesses;
delete from public.categories;
