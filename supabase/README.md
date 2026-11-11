# Beautiva Supabase Backend Setup (.env)

Beautiva integrates **Supabase (Postgres, Auth, Storage & RLS)** with full **Super Admin** and **Vendor Admin** governance.

## 1. Run Database Schema & Seed Data
In your Supabase project dashboard (**SQL Editor**):
1. Run `supabase/migrations/001_beautiva_schema.sql` (creates tables, `private` RLS helpers, triggers, RLS policies, and the `beautiva-media` Storage bucket).
2. Run `supabase/seed.sql` (seeds all 6 categories, partner studios, services, staff, reviews, bookings, transactions, and a sample vendor invitation).

## 2. Configure `.env`
Open `.env` in the `Beautiva/` project root and fill in your Supabase credentials from **Project Settings → API**:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-server-only
PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key
SUPER_ADMIN_EMAILS=admin@beautiva.ng
```

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are synced into `src/environments/environment.ts` automatically on `npm start` and `npm run build` (via `scripts/set-env.js`).
- `SUPABASE_SERVICE_ROLE_KEY` stays strictly on the Express SSR server (`src/server.ts`) for `/api/public/track/:reference` and `/api/admin/create-vendor-account`.

## 3. Role Access
- **Super Admin**: Sign up with an email matching `SUPER_ADMIN_EMAILS` (`admin@beautiva.ng` by default), or promote any profile in `public.profiles` (`set role = 'super_admin'`).
- **Vendor Admin**: Sign up as Vendor (or via `/auth?invite=<token>`), or provision directly from **Super Admin → Vendor Management → Create Vendor Account**.
- **Demo Quick-Switch**: Visit `/auth` anytime to switch between Super Admin, Vendor Admin, and Customer roles immediately.

