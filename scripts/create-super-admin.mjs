import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = (process.env.SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const adminEmail = (process.env.SUPER_ADMIN_EMAILS || 'admin@beautiva.ng')
  .split(',')[0]
  .trim()
  .toLowerCase();

const password = process.argv[2];

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!password || password.length < 6) {
  console.error('Usage: node scripts/create-super-admin.mjs <password-min-6-chars>');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listData } = await admin.auth.admin.listUsers();
const existing = listData?.users?.find((u) => u.email?.toLowerCase() === adminEmail);

let userId;
if (existing) {
  const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    app_metadata: { ...(existing.app_metadata || {}), role: 'super_admin' },
  });
  if (updErr) {
    console.error('Failed updating super admin user:', updErr.message);
    process.exit(1);
  }
  userId = updated.user.id;
} else {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Beautiva Super Admin' },
    app_metadata: { role: 'super_admin' },
  });
  if (createErr || !created.user) {
    console.error('Failed creating super admin user:', createErr?.message);
    process.exit(1);
  }
  userId = created.user.id;
}

const { error: profErr } = await admin.from('profiles').upsert({
  id: userId,
  email: adminEmail,
  full_name: 'Beautiva Super Admin',
  role: 'super_admin',
  status: 'active',
});

if (profErr) {
  console.error('Failed upserting profile:', profErr.message);
  process.exit(1);
}

console.log(`Super Admin ready! Sign in at /auth with email: ${adminEmail}`);

