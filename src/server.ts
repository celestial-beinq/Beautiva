import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import express from 'express';
import { join } from 'node:path';

dotenv.config();

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());
const angularApp = new AngularNodeAppEngine();

const supabaseUrl = (process.env['SUPABASE_URL'] || '').trim();
const supabaseAnonKey = (process.env['SUPABASE_ANON_KEY'] || '').trim();
const supabaseServiceKey = (process.env['SUPABASE_SERVICE_ROLE_KEY'] || '').trim();

function getAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    serviceRoleConfigured: Boolean(supabaseUrl && supabaseServiceKey),
  });
});

// Guest booking tracking lookup by exact reference (no full-table exposure)
app.get('/api/public/track/:reference', async (req, res) => {
  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({ error: 'Service role key not configured on SSR server' });
    return;
  }

  const ref = String(req.params['reference'] || '').trim().toUpperCase();
  if (!ref) {
    res.status(400).json({ error: 'Booking reference is required' });
    return;
  }

  const { data, error } = await admin
    .from('bookings')
    .select('*')
    .ilike('booking_reference', ref)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  res.json({ booking: data });
});

// Super Admin: Provision real Supabase Auth vendor user + profile
app.post('/api/admin/create-vendor-account', async (req, res) => {
  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({
      requiresServiceRole: true,
      error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to provision auth users directly.',
    });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Invalid auth session' });
    return;
  }

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (callerProfile?.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin role required' });
    return;
  }

  const { email, password, fullName, phone } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    phone?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and temporary password are required' });
    return;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || email.split('@')[0],
      phone: phone || '',
      requested_role: 'vendor',
    },
  });

  if (createErr || !created.user) {
    res.status(400).json({ error: createErr?.message || 'Failed to create vendor account' });
    return;
  }

  await admin
    .from('profiles')
    .upsert({
      id: created.user.id,
      email: email.trim().toLowerCase(),
      full_name: fullName || email.split('@')[0],
      phone: phone || '',
      role: 'vendor',
      status: 'active',
    });

  res.status(201).json({ userId: created.user.id, email: created.user.email });
});

// Public: Submit a new vendor application
app.post('/api/public/vendor-applications', async (req, res) => {
  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({ error: 'Service role not configured' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const { error, data } = await admin
    .from('vendor_applications')
    .insert({
      application_number: body['applicationNumber'],
      owner_name: body['ownerName'],
      email: String(body['email'] || '').trim().toLowerCase(),
      phone: body['phone'] || '',
      business_name: body['businessName'],
      slug: body['slug'],
      category_slug: body['categorySlug'],
      category_label: body['categoryLabel'],
      city: body['city'] || 'Lagos',
      location: body['location'] || '',
      address: body['address'] || '',
      tagline: body['tagline'] || '',
      about: body['about'] || '',
      instagram: body['instagram'] || '',
      cover_image: body['coverImage'] || 'images/hero-salon.jpg',
      starting_service_name: body['startingServiceName'] || 'Signature Session',
      starting_service_price: Number(body['startingServicePrice']) || 20000,
      starting_service_duration_minutes: Number(body['startingServiceDurationMinutes']) || 60,
      onboarding_fee: Number(body['onboardingFee']) || 25000,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json({ application: data });
});

// Public: Look up a vendor application by exact application number
app.get('/api/public/vendor-application/:appNumber', async (req, res) => {
  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({ error: 'Service role not configured' });
    return;
  }
  const appNum = String(req.params['appNumber'] || '').trim().toUpperCase();
  if (!appNum) {
    res.status(400).json({ error: 'Application number is required' });
    return;
  }
  const { data, error } = await admin
    .from('vendor_applications')
    .select('*')
    .ilike('application_number', appNum)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  res.json({ application: data });
});

// Public: Complete Paystack onboarding payment for an approved application & issue vendor login
app.post('/api/public/vendor-applications/:appNumber/complete-onboarding', async (req, res) => {
  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({ error: 'Service role not configured' });
    return;
  }

  const appNum = String(req.params['appNumber'] || '').trim().toUpperCase();
  const { paystackReference, tempPassword, email, ownerName, phone } = req.body as {
    paystackReference?: string;
    tempPassword?: string;
    email?: string;
    ownerName?: string;
    phone?: string;
  };

  if (!paystackReference || !tempPassword || !email) {
    res.status(400).json({ error: 'Paystack reference, email, and temp password are required' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  let userId: string | null = null;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: ownerName || normalizedEmail.split('@')[0],
      phone: phone || '',
      requested_role: 'vendor',
    },
  });

  if (!createErr && created.user) {
    userId = created.user.id;
  } else {
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (existingProfile?.id) {
      const existingId = String(existingProfile.id);
      userId = existingId;
      await admin.auth.admin.updateUserById(existingId, { password: tempPassword });
    }
  }

  if (userId) {
    await admin.from('profiles').upsert({
      id: userId,
      email: normalizedEmail,
      full_name: ownerName || normalizedEmail.split('@')[0],
      phone: phone || '',
      role: 'vendor',
      status: 'active',
    });
  }

  await admin
    .from('vendor_applications')
    .update({
      status: 'paid_live',
      paystack_reference: paystackReference,
      paid_at: new Date().toISOString(),
      issued_login_email: normalizedEmail,
      issued_temp_password: tempPassword,
    })
    .ilike('application_number', appNum);

  res.status(200).json({ ok: true, userId, email: normalizedEmail });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
