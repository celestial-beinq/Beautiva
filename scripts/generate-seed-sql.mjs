import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const seedTsPath = path.join(__dirname, '../src/app/data/seed-data.ts');
let src = fs.readFileSync(seedTsPath, 'utf8');

// Strip TS imports and type annotations on exported consts so Node can evaluate the data objects
src = src
  .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '')
  .replace(/export\s+const\s+(\w+)\s*:\s*[^=]+=/g, 'const $1 =')
  .concat('\nmodule.exports = { DEFAULT_WORKING_HOURS, SEED_CATEGORIES, SEED_BUSINESSES, SEED_BOOKINGS };');

const mod = { exports: {} };
vm.runInNewContext(src, { module: mod, exports: mod.exports });
const { SEED_CATEGORIES, SEED_BUSINESSES, SEED_BOOKINGS } = mod.exports;

const sqlEscape = (val) => {
  if (val === null || val === undefined) return 'null';
  return `'${String(val).replace(/'/g, "''")}'`;
};

const sqlTextArray = (arr) => {
  if (!arr || !arr.length) return `'{}'::text[]`;
  return `ARRAY[${arr.map(sqlEscape).join(', ')}]::text[]`;
};

const sqlJson = (obj) => `${sqlEscape(JSON.stringify(obj ?? {}))}::jsonb`;

// Deterministic UUID helper so seed.sql is idempotent!
const makeUuid = (prefixNum, idx) => {
  const hex = String(idx).padStart(12, '0');
  return `00000000-0000-4000-${String(prefixNum).padStart(4, '0')}-${hex}`;
};

const lines = [];
lines.push('-- ============================================================================');
lines.push('-- Beautiva Seed Data (Idempotent)');
lines.push('-- Run after 001_beautiva_schema.sql in Supabase SQL Editor');
lines.push('-- ============================================================================');
lines.push('');

lines.push('-- 1. Categories');
SEED_CATEGORIES.forEach((cat, idx) => {
  const id = makeUuid(1000, idx + 1);
  lines.push(
    `insert into public.categories (id, slug, name, short_name, tagline, description, cover_image, popular_tags, is_active, sort_order) values (${sqlEscape(id)}, ${sqlEscape(cat.slug)}, ${sqlEscape(cat.name)}, ${sqlEscape(cat.shortName)}, ${sqlEscape(cat.tagline)}, ${sqlEscape(cat.description)}, ${sqlEscape(cat.coverImage)}, ${sqlTextArray(cat.popularTags)}, true, ${idx + 1}) on conflict (slug) do update set name = excluded.name, short_name = excluded.short_name, tagline = excluded.tagline, description = excluded.description, cover_image = excluded.cover_image, popular_tags = excluded.popular_tags, sort_order = excluded.sort_order;`,
  );
});

lines.push('');
lines.push('-- 2. Businesses, Services, Staff & Reviews');
const slugToUuid = {};
let serviceSeq = 1;
let staffSeq = 1;
let reviewSeq = 1;

SEED_BUSINESSES.forEach((biz, idx) => {
  const bizId = makeUuid(2000, idx + 1);
  slugToUuid[biz.slug] = bizId;
  const status = biz.status || 'active';
  const defaultAvail = {
    slotDurationMinutes: 60,
    bufferMinutes: 15,
    blockedDates: [],
    breaks: [{ id: 'brk-lunch', day: 'All Days', start: '01:00 PM', end: '02:00 PM', label: 'Midday Reset' }],
    enabledSlots: ['09:00 AM', '10:00 AM', '11:30 AM', '01:00 PM', '02:30 PM', '04:00 PM', '05:30 PM'],
  };

  lines.push(
    `insert into public.businesses (id, slug, name, category_slug, category_label, tagline, about, location, city, address, logo_text, logo_bg, cover_image, gallery, rating, review_count, verified, featured, status, working_hours, availability_settings, contact, payment_policy) values (${sqlEscape(bizId)}, ${sqlEscape(biz.slug)}, ${sqlEscape(biz.name)}, ${sqlEscape(biz.categorySlug)}, ${sqlEscape(biz.categoryLabel)}, ${sqlEscape(biz.tagline)}, ${sqlEscape(biz.about)}, ${sqlEscape(biz.location)}, ${sqlEscape(biz.city)}, ${sqlEscape(biz.address)}, ${sqlEscape(biz.logoText)}, ${sqlEscape(biz.logoBg)}, ${sqlEscape(biz.coverImage)}, ${sqlTextArray(biz.gallery)}, ${biz.rating}, ${biz.reviewCount}, ${biz.verified}, ${biz.featured}, ${sqlEscape(status)}, ${sqlJson(biz.workingHours)}, ${sqlJson(defaultAvail)}, ${sqlJson(biz.contact)}, ${sqlJson(biz.paymentPolicy)}) on conflict (slug) do nothing;`,
  );

  (biz.services || []).forEach((srv, sIdx) => {
    const srvId = makeUuid(3000, serviceSeq++);
    lines.push(
      `insert into public.services (id, business_id, legacy_id, name, category_label, price, duration_minutes, description, image_url, is_active, sort_order) values (${sqlEscape(srvId)}, ${sqlEscape(bizId)}, ${sqlEscape(srv.id)}, ${sqlEscape(srv.name)}, ${sqlEscape(srv.categoryLabel)}, ${srv.price}, ${srv.durationMinutes}, ${sqlEscape(srv.description)}, ${sqlEscape(biz.coverImage)}, true, ${sIdx + 1}) on conflict (id) do nothing;`,
    );
  });

  (biz.staff || []).forEach((stf) => {
    const stfId = makeUuid(4000, staffSeq++);
    lines.push(
      `insert into public.staff_members (id, business_id, legacy_id, name, role, specialty, avatar_color, is_active) values (${sqlEscape(stfId)}, ${sqlEscape(bizId)}, ${sqlEscape(stf.id)}, ${sqlEscape(stf.name)}, ${sqlEscape(stf.role)}, ${sqlEscape(stf.specialty)}, ${sqlEscape(stf.avatarColor)}, true) on conflict (id) do nothing;`,
    );
  });

  (biz.reviews || []).forEach((rev) => {
    const revId = makeUuid(5000, reviewSeq++);
    lines.push(
      `insert into public.reviews (id, business_id, business_slug, author, rating, service_name, date_label, comment, status) values (${sqlEscape(revId)}, ${sqlEscape(bizId)}, ${sqlEscape(biz.slug)}, ${sqlEscape(rev.author)}, ${rev.rating}, ${sqlEscape(rev.serviceName)}, ${sqlEscape(rev.dateLabel)}, ${sqlEscape(rev.comment)}, 'published') on conflict (id) do nothing;`,
    );
  });
});

// Add one pending vendor application so Super Admin can immediately test "Approve vendor registrations"
const pendingBizId = makeUuid(2000, SEED_BUSINESSES.length + 1);
lines.push(
  `insert into public.businesses (id, slug, name, category_slug, category_label, tagline, about, location, city, address, logo_text, logo_bg, cover_image, gallery, rating, review_count, verified, featured, status, working_hours, contact, payment_policy) values (${sqlEscape(pendingBizId)}, 'maison-zuri-abuja', 'Maison Zuri Abuja', 'makeup-artists', 'Makeup Artists', 'Editorial & bridal skin-first glam in Wuse II.', 'Pending studio application awaiting Super Admin review.', 'Wuse II, Abuja', 'Abuja', '19 Aminu Kano Crescent, Wuse II, Abuja', 'MZ', '#4a3525', 'images/cat-makeup.jpg', ARRAY['images/cat-makeup.jpg']::text[], 5.0, 0, false, false, 'pending', ${sqlJson(SEED_BUSINESSES[0].workingHours)}, ${sqlJson({ phone: '+234 809 555 0199', email: 'hello@maisonzuri.ng', instagram: '@maisonzuri' })}, ${sqlJson({ allowFull: true, allowDeposit: true, depositPercent: 30, allowPayAtBusiness: true })}) on conflict (slug) do nothing;`,
);
lines.push(
  `insert into public.services (id, business_id, legacy_id, name, category_label, price, duration_minutes, description, is_active, sort_order) values (${sqlEscape(makeUuid(3000, serviceSeq++))}, ${sqlEscape(pendingBizId)}, 'srv-mz-1', 'Bridal Soft Glam', 'Bridal', 85000, 120, 'Luminous waterproof bridal glam with skin prep and lashes.', true, 1) on conflict (id) do nothing;`,
);

lines.push('');
lines.push('-- 3. Bookings & Transactions');
SEED_BOOKINGS.forEach((bk, idx) => {
  const bkId = makeUuid(6000, idx + 1);
  const bizId = slugToUuid[bk.businessSlug] || makeUuid(2000, 1);
  const biz = SEED_BUSINESSES.find((b) => b.slug === bk.businessSlug);
  const catSlug = biz ? biz.categorySlug : 'hairdressers';

  lines.push(
    `insert into public.bookings (id, booking_reference, business_id, business_slug, business_name, business_location, category_slug, service_id, service_name, service_price, service_duration_minutes, date, date_display, time, staff_name, customer_name, customer_email, customer_phone, notes, payment_option, amount_paid, balance_due, payment_status, paystack_reference, status, created_at) values (${sqlEscape(bkId)}, ${sqlEscape(bk.bookingReference)}, ${sqlEscape(bizId)}, ${sqlEscape(bk.businessSlug)}, ${sqlEscape(bk.businessName)}, ${sqlEscape(bk.businessLocation)}, ${sqlEscape(catSlug)}, ${sqlEscape(bk.serviceId)}, ${sqlEscape(bk.serviceName)}, ${bk.servicePrice}, ${bk.serviceDurationMinutes}, ${sqlEscape(bk.date)}, ${sqlEscape(bk.dateDisplay)}, ${sqlEscape(bk.time)}, ${sqlEscape(bk.staffName)}, ${sqlEscape(bk.customerName)}, ${sqlEscape(bk.customerEmail)}, ${sqlEscape(bk.customerPhone)}, ${sqlEscape(bk.notes || null)}, ${sqlEscape(bk.paymentOption)}, ${bk.amountPaid}, ${bk.balanceDue}, ${sqlEscape(bk.paymentStatus)}, ${sqlEscape(bk.paystackReference || null)}, ${sqlEscape(bk.status)}, ${sqlEscape(bk.createdAt)}) on conflict (booking_reference) do nothing;`,
  );

  if (bk.amountPaid > 0) {
    const txId = makeUuid(7000, idx + 1);
    const comm = Math.round(bk.amountPaid * 0.1);
    const net = bk.amountPaid - comm;
    lines.push(
      `insert into public.transactions (id, booking_id, booking_reference, business_id, business_name, customer_name, customer_email, gateway, gateway_reference, amount, platform_commission_rate, platform_commission_amount, vendor_net_amount, status, paid_at, created_at) values (${sqlEscape(txId)}, ${sqlEscape(bkId)}, ${sqlEscape(bk.bookingReference)}, ${sqlEscape(bizId)}, ${sqlEscape(bk.businessName)}, ${sqlEscape(bk.customerName)}, ${sqlEscape(bk.customerEmail)}, 'Paystack', ${sqlEscape(bk.paystackReference || `PSK_SEED_${idx + 1}`)}, ${bk.amountPaid}, 10.00, ${comm}, ${net}, 'success', ${sqlEscape(bk.createdAt)}, ${sqlEscape(bk.createdAt)}) on conflict (id) do nothing;`,
    );
  }
});

// Sample failed transaction for Payment Management tracking
lines.push(
  `insert into public.transactions (id, booking_reference, business_id, business_name, customer_name, customer_email, gateway, gateway_reference, amount, platform_commission_rate, platform_commission_amount, vendor_net_amount, status, failure_reason, created_at) values (${sqlEscape(makeUuid(7000, 99))}, 'BK-2026-000119', ${sqlEscape(slugToUuid['velvet-crown-atelier'] || makeUuid(2000, 2))}, 'Velvet Crown Atelier', 'Teniola Adewale', 'teniola.a@example.com', 'Paystack', 'PSK_FAIL_000119', 45000, 10.00, 0, 0, 'failed', 'Insufficient funds / 3DS timeout', '2026-11-08T15:10:00.000Z') on conflict (id) do nothing;`,
);

// Sample vendor invitation
lines.push('');
lines.push('-- 4. Sample Vendor Invitation');
lines.push(
  `insert into public.vendor_invitations (id, email, business_name, category_slug, city, invite_token, status) values (${sqlEscape(makeUuid(8000, 1))}, 'founder@solaceglow.ng', 'Solace Glow Collective', 'lash-technicians', 'Lagos', 'inv-beautiva-solace-2026', 'pending') on conflict (invite_token) do nothing;`,
);

const outPath = path.join(__dirname, '../supabase/seed.sql');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`[generate-seed-sql] Wrote ${lines.length} SQL statements to ${outPath}`);
