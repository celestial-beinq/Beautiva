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
const paystackSecretKey = (process.env['PAYSTACK_SECRET_KEY'] || '').trim();

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
    paystackVerificationConfigured: Boolean(paystackSecretKey),
  });
});

// Server-side Paystack transaction verification using PAYSTACK_SECRET_KEY
app.post('/api/paystack/verify', async (req, res) => {
  const { reference, expectedAmount } = req.body as {
    reference?: string;
    expectedAmount?: number;
  };

  const ref = String(reference || '').trim();
  if (!ref) {
    res.status(400).json({ verified: false, error: 'Transaction reference is required' });
    return;
  }

  if (!paystackSecretKey) {
    res.status(503).json({
      verified: false,
      verificationSkipped: true,
      error: 'PAYSTACK_SECRET_KEY is not configured on the server.',
    });
    return;
  }

  try {
    const resp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
      {
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
      },
    );
    const payload = (await resp.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        channel?: string;
        paid_at?: string;
        reference?: string;
      };
    };

    if (!resp.ok || !payload.status || payload.data?.status !== 'success') {
      res.status(400).json({
        verified: false,
        error: payload.message || 'Paystack transaction was not successful.',
      });
      return;
    }

    const expectedKobo = Math.round((Number(expectedAmount) || 0) * 100);
    if (expectedKobo > 0 && (payload.data.amount ?? 0) < expectedKobo) {
      res.status(400).json({
        verified: false,
        error: 'Verified Paystack amount does not match the required payment.',
      });
      return;
    }

    res.json({
      verified: true,
      reference: payload.data.reference || ref,
      amountNaira: Math.round((payload.data.amount ?? 0) / 100),
      channel: payload.data.channel,
      paidAt: payload.data.paid_at,
    });
  } catch (err: any) {
    res.status(502).json({
      verified: false,
      error: err?.message || 'Unable to verify transaction with Paystack API.',
    });
  }
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

function getSuperAdminEmails(): string[] {
  return (process.env['SUPER_ADMIN_EMAILS'] || 'admin@beautiva.ng')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function writeServerActivityLog(
  admin: SupabaseClient,
  entry: {
    eventType: string;
    category: string;
    actorName?: string;
    actorEmail?: string | null;
    actorRole?: string;
    entityType?: string;
    entityId?: string;
    entityName?: string;
    summary: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  },
): Promise<void> {
  try {
    await admin.from('activity_logs').insert({
      event_type: entry.eventType,
      category: entry.category,
      actor_name: entry.actorName || 'System',
      actor_email: entry.actorEmail || null,
      actor_role: entry.actorRole || 'system',
      entity_type: entry.entityType || null,
      entity_id: entry.entityId || null,
      entity_name: entry.entityName || null,
      summary: entry.summary,
      metadata: entry.metadata ?? {},
      created_at: entry.createdAt || new Date().toISOString(),
    });
  } catch {
    // Ignore if activity_logs migration has not been executed yet
  }
}

async function verifySuperAdmin(
  req: express.Request,
  res: express.Response,
): Promise<{ admin: SupabaseClient; userId: string } | null> {
  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({
      requiresServiceRole: true,
      error: 'SUPABASE_SERVICE_ROLE_KEY is required on the server.',
    });
    return null;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing Super Admin auth token' });
    return null;
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Invalid auth session' });
    return null;
  }

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  const userEmail = (userData.user.email || '').trim().toLowerCase();
  const isAllowed =
    callerProfile?.role === 'super_admin' ||
    (Boolean(userEmail) && getSuperAdminEmails().includes(userEmail));

  if (!isAllowed) {
    res.status(403).json({ error: 'Super Admin role required' });
    return null;
  }

  return { admin, userId: userData.user.id };
}

// Super Admin: Provision real Supabase Auth vendor user + profile
app.post('/api/admin/create-vendor-account', async (req, res) => {
  const authCtx = await verifySuperAdmin(req, res);
  if (!authCtx) return;
  const { admin } = authCtx;

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
  const { data: settingsRow } = await admin
    .from('platform_settings')
    .select('vendor_onboarding_fee')
    .eq('id', 1)
    .maybeSingle();

  const configuredFee = Number(settingsRow?.['vendor_onboarding_fee']);
  const onboardingFee = Number.isFinite(configuredFee)
    ? configuredFee
    : Number(body['onboardingFee']) || 25000;

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
      onboarding_fee: onboardingFee,
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

// Super Admin: Accept or decline a vendor application
app.post('/api/admin/vendor-applications/:appNumber/review', async (req, res) => {
  const authCtx = await verifySuperAdmin(req, res);
  if (!authCtx) return;
  const { admin } = authCtx;

  const appNum = String(req.params['appNumber'] || '').trim().toUpperCase();
  const { decision, adminNote } = req.body as {
    decision?: 'approved' | 'declined';
    adminNote?: string;
  };

  if (decision !== 'approved' && decision !== 'declined') {
    res.status(400).json({ error: 'Decision must be approved or declined' });
    return;
  }

  const { data, error } = await admin
    .from('vendor_applications')
    .update({
      status: decision,
      admin_note: adminNote?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .ilike('application_number', appNum)
    .select('*')
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: `Application ${appNum} not found` });
    return;
  }

  res.status(200).json({ ok: true, application: data });
});

// Super Admin: Update studio attributes (profile, verified, featured, status)
app.patch('/api/admin/businesses/:id', async (req, res) => {
  const authCtx = await verifySuperAdmin(req, res);
  if (!authCtx) return;
  const { admin } = authCtx;

  const idOrSlug = String(req.params['id'] || '').trim();
  if (!idOrSlug) {
    res.status(400).json({ error: 'Studio identifier is required' });
    return;
  }

  const allowedKeys = [
    'name',
    'category_slug',
    'category_label',
    'tagline',
    'about',
    'location',
    'city',
    'address',
    'logo_image',
    'cover_image',
    'gallery',
    'working_hours',
    'availability_settings',
    'contact',
    'payment_policy',
    'verified',
    'featured',
    'status',
  ] as const;

  const body = (req.body || {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      patch[key] = body[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No valid update fields provided' });
    return;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const query = admin.from('businesses').update(patch);
  const { data, error } = await (isUuid ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug))
    .select('*')
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'Studio not found' });
    return;
  }

  res.status(200).json({ ok: true, business: data });
});

// Super Admin: Delete a studio
app.delete('/api/admin/businesses/:id', async (req, res) => {
  const authCtx = await verifySuperAdmin(req, res);
  if (!authCtx) return;
  const { admin } = authCtx;

  const idOrSlug = String(req.params['id'] || '').trim();
  if (!idOrSlug) {
    res.status(400).json({ error: 'Studio identifier is required' });
    return;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const query = admin.from('businesses').delete();
  const { data, error } = await (isUuid ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug))
    .select('id')
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'Studio not found' });
    return;
  }

  res.status(200).json({ ok: true, id: data['id'] });
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

  const { data: appRow } = await admin
    .from('vendor_applications')
    .select('*')
    .ilike('application_number', appNum)
    .maybeSingle();

  if (!appRow) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  if (appRow['status'] !== 'approved') {
    res.status(400).json({
      error:
        appRow['status'] === 'paid_live'
          ? 'This application has already been paid and activated.'
          : 'This application must be approved by the Super Admin before payment.',
    });
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

  const businessName = String(appRow['business_name'] || 'Studio').trim();
  const baseSlug = String(appRow['slug'] || businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const words = businessName.split(/\s+/);
  const logoText =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : businessName.slice(0, 2).toUpperCase();

  const defaultWorkingHours = [
    { day: 'Monday', open: '09:00 AM', close: '07:00 PM' },
    { day: 'Tuesday', open: '09:00 AM', close: '07:00 PM' },
    { day: 'Wednesday', open: '09:00 AM', close: '07:00 PM' },
    { day: 'Thursday', open: '09:00 AM', close: '08:00 PM' },
    { day: 'Friday', open: '09:00 AM', close: '08:00 PM' },
    { day: 'Saturday', open: '08:30 AM', close: '08:00 PM' },
    { day: 'Sunday', open: '12:00 PM', close: '06:00 PM' },
  ];

  const { data: bizRow, error: bizErr } = await admin
    .from('businesses')
    .upsert(
      {
        owner_id: userId,
        slug: baseSlug,
        name: businessName,
        category_slug: appRow['category_slug'],
        category_label: appRow['category_label'],
        tagline: appRow['tagline'] || '',
        about: appRow['about'] || '',
        location: appRow['location'] || '',
        city: appRow['city'] || 'Lagos',
        address: appRow['address'] || appRow['location'] || '',
        logo_text: logoText,
        logo_bg: '#3b0b0b',
        cover_image: appRow['cover_image'] || 'images/hero-salon.jpg',
        gallery: [],
        rating: 5.0,
        review_count: 0,
        verified: true,
        featured: false,
        status: 'active',
        working_hours: defaultWorkingHours,
        contact: {
          phone: appRow['phone'] || '',
          email: normalizedEmail,
          instagram: appRow['instagram'] || `@${baseSlug}`,
        },
        payment_policy: {
          allowFull: true,
          allowDeposit: true,
          depositPercent: 30,
          allowPayAtBusiness: true,
        },
      },
      { onConflict: 'slug' },
    )
    .select('*')
    .single();

  if (bizErr) {
    res.status(400).json({ error: `Could not create live business: ${bizErr.message}` });
    return;
  }

  const businessId = bizRow['id'];
  const existingServices = await admin
    .from('services')
    .select('id')
    .eq('business_id', businessId)
    .limit(1);
  if (!existingServices.data || existingServices.data.length === 0) {
    await admin.from('services').insert({
      business_id: businessId,
      name: appRow['starting_service_name'] || 'Signature Session',
      category_label: String(appRow['category_label'] || 'Signature'),
      price: Number(appRow['starting_service_price']) || 20000,
      duration_minutes: Number(appRow['starting_service_duration_minutes']) || 60,
      description: `${appRow['starting_service_name'] || 'Signature Session'} at ${businessName}.`,
      image_url: appRow['cover_image'] || null,
      is_active: true,
      sort_order: 1,
    });
  }

  const existingStaff = await admin
    .from('staff_members')
    .select('id')
    .eq('business_id', businessId)
    .limit(1);
  if (!existingStaff.data || existingStaff.data.length === 0) {
    await admin.from('staff_members').insert({
      business_id: businessId,
      name: ownerName || appRow['owner_name'] || 'Studio Owner',
      role: 'Founder & Lead Specialist',
      specialty: String(appRow['category_label'] || 'Studio Craft'),
      avatar_color: '#b81d1a',
      is_active: true,
    });
  }

  const nowIso = new Date().toISOString();
  const onboardingFee = Number(appRow['onboarding_fee']) || 25000;
  await admin.from('transactions').insert({
    booking_reference: appNum,
    business_id: businessId,
    business_name: businessName,
    customer_name: ownerName || appRow['owner_name'] || businessName,
    customer_email: normalizedEmail,
    gateway: 'Paystack (Vendor Onboarding)',
    gateway_reference: paystackReference,
    amount: onboardingFee,
    platform_commission_rate: 100,
    platform_commission_amount: onboardingFee,
    vendor_net_amount: 0,
    status: 'success',
    paid_at: nowIso,
    created_at: nowIso,
  });

  await writeServerActivityLog(admin, {
    eventType: 'payment.onboarding_success',
    category: 'transaction',
    actorName: ownerName || String(appRow['owner_name'] || businessName),
    actorEmail: normalizedEmail,
    actorRole: 'vendor',
    entityType: 'transaction',
    entityId: paystackReference,
    entityName: businessName,
    summary: `Onboarding fee of ₦${onboardingFee.toLocaleString('en-NG')} paid via Paystack (${paystackReference}) for ${businessName} (${appNum}).`,
    metadata: { amount: onboardingFee, applicationNumber: appNum, paystackReference },
    createdAt: nowIso,
  });

  const { data: updatedAppRow } = await admin
    .from('vendor_applications')
    .update({
      status: 'paid_live',
      paystack_reference: paystackReference,
      paid_at: nowIso,
      issued_login_email: normalizedEmail,
      issued_temp_password: tempPassword,
      live_business_slug: bizRow['slug'],
    })
    .ilike('application_number', appNum)
    .select('*')
    .maybeSingle();

  res.status(200).json({
    ok: true,
    userId,
    email: normalizedEmail,
    business: bizRow,
    application: updatedAppRow,
  });
});

// Super Admin: Fetch platform activity logs
app.get('/api/admin/activity-logs', async (req, res) => {
  const authCtx = await verifySuperAdmin(req, res);
  if (!authCtx) return;
  const { admin } = authCtx;

  const { data, error } = await admin
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    res.status(200).json({ logs: [] });
    return;
  }
  res.status(200).json({ logs: data || [] });
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
