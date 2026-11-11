import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { DEFAULT_WORKING_HOURS } from '../data/seed-data';
import {
  AccountStatus,
  ActivityCategory,
  ActivityLogRecord,
  AvailabilitySettings,
  BookingRecord,
  BookingStatus,
  BusinessContact,
  BusinessProfile,
  BusinessReview,
  CategoryInfo,
  CategorySlug,
  PaymentOption,
  PaymentPolicy,
  PaymentStatus,
  PlatformSettings,
  PopularServiceHighlight,
  ServiceItem,
  StaffMember,
  StudioStatus,
  TransactionRecord,
  UserProfile,
  VendorApplication,
  VendorApplicationStatus,
  VendorCredentialRecord,
  VendorInvitation,
  WorkingHours,
} from '../models/marketplace.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const BUSINESSES_STORAGE_KEY = 'beautiva_businesses_v2';
const BOOKINGS_STORAGE_KEY = 'beautiva_bookings_v2';
const CATEGORIES_STORAGE_KEY = 'beautiva_categories_v2';
const TRANSACTIONS_STORAGE_KEY = 'beautiva_transactions_v2';
const INVITATIONS_STORAGE_KEY = 'beautiva_invitations_v2';
const SETTINGS_STORAGE_KEY = 'beautiva_settings_v2';
const CUSTOMERS_STORAGE_KEY = 'beautiva_customers_v2';
const APPLICATIONS_STORAGE_KEY = 'beautiva_vendor_applications_v2';
const ACTIVITY_LOGS_STORAGE_KEY = 'beautiva_activity_logs_v2';
const VENDOR_CREDS_STORAGE_KEY = 'beautiva_vendor_creds_v1';

const LEGACY_STORAGE_KEYS = [
  'beautiva_businesses_v1',
  'beautiva_bookings_v1',
  'beautiva_categories_v1',
  'beautiva_transactions_v1',
  'beautiva_invitations_v1',
  'beautiva_settings_v1',
  'beautiva_customers_v1',
];

export const DEFAULT_TIME_SLOTS = [
  '09:00 AM',
  '10:00 AM',
  '11:30 AM',
  '01:00 PM',
  '02:30 PM',
  '04:00 PM',
  '05:30 PM',
];

export const DEFAULT_AVAILABILITY: AvailabilitySettings = {
  slotDurationMinutes: 60,
  bufferMinutes: 15,
  blockedDates: [],
  breaks: [
    {
      id: 'brk-midday',
      day: 'All Days',
      start: '01:00 PM',
      end: '02:00 PM',
      label: 'Midday Reset',
    },
  ],
  enabledSlots: [...DEFAULT_TIME_SLOTS],
};

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  commissionRate: 10,
  vendorOnboardingFee: 25000,
  siteName: 'Beautiva',
  heroHeadline: 'Curated Nigerian Beauty & Grooming Studios',
  heroSubheadline:
    'Discover vetted hairdressers, barbers, nail ateliers, lash artists, MUAs & tattoo studios across Lagos & Abuja.',
  announcementBanner: '',
  supportEmail: 'concierge@beautiva.ng',
  supportPhone: '+234 800 232 8848',
  notifyNewBooking: true,
  notifyPaymentFailed: true,
  notifyVendorApplication: true,
  notifyBookingReminders: true,
};

export interface CreateBookingInput {
  businessSlug: string;
  serviceId: string;
  date: string;
  dateDisplay: string;
  time: string;
  staffName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string;
  paymentOption: PaymentOption;
  paystackReference?: string;
}

export interface VendorCustomerSummary {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalSpent: number;
  lastVisitDate: string;
  bookings: BookingRecord[];
}

@Injectable({
  providedIn: 'root',
})
export class MarketplaceService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly categories = signal<CategoryInfo[]>(this.loadCategories());
  readonly businesses = signal<BusinessProfile[]>(this.loadBusinesses());
  readonly bookings = signal<BookingRecord[]>(this.loadBookings());
  readonly transactions = signal<TransactionRecord[]>(this.loadTransactions());
  readonly vendorInvitations = signal<VendorInvitation[]>(this.loadInvitations());
  readonly platformSettings = signal<PlatformSettings>(this.loadSettings());
  readonly customerAccounts = signal<UserProfile[]>(this.loadCustomerAccounts());
  readonly vendorApplications = signal<VendorApplication[]>(this.loadApplications());
  readonly activityLogs = signal<ActivityLogRecord[]>(this.loadActivityLogs());
  readonly vendorCredentials = signal<VendorCredentialRecord[]>(this.loadVendorCredentials());

  readonly bookedSlotsExternal = signal<
    Array<{ businessSlug: string; bookingDate: string; bookingTime: string; status: string }>
  >([]);

  readonly supabaseConfigured = this.sb.isConfigured;
  readonly backendConnected = signal<boolean>(false);
  readonly backendLoading = signal<boolean>(false);
  readonly backendError = signal<string | null>(null);

  readonly activeBusinesses = computed(() =>
    this.businesses().filter((b) => (b.status ?? 'active') === 'active'),
  );

  readonly featuredBusinesses = computed(() =>
    this.activeBusinesses().filter((b) => b.featured).slice(0, 6),
  );

  readonly popularServices = computed<PopularServiceHighlight[]>(() => {
    const list: PopularServiceHighlight[] = [];
    for (const biz of this.activeBusinesses()) {
      const activeServices = this.getActiveServices(biz);
      if (activeServices.length > 0) {
        list.push({
          businessSlug: biz.slug,
          businessName: biz.name,
          businessLocation: biz.location,
          categorySlug: biz.categorySlug,
          service: activeServices[0],
          coverImage: biz.coverImage,
        });
      }
    }
    return list.slice(0, 6);
  });

  readonly recentTestimonials = computed(() => {
    const collected: Array<
      BusinessReview & { businessName: string; businessSlug: string; categoryLabel: string }
    > = [];
    for (const biz of this.businesses()) {
      for (const rev of biz.reviews) {
        if (rev.status === 'hidden') continue;
        collected.push({
          ...rev,
          businessName: biz.name,
          businessSlug: biz.slug,
          categoryLabel: biz.categoryLabel,
        });
      }
    }
    return collected.slice(0, 6);
  });

  constructor() {
    this.clearLegacySeedStorage();
    if (this.isBrowser && this.sb.client) {
      void this.refreshFromBackend();

      // Re-fetch user-scoped records when auth session changes
      effect(() => {
        const mode = this.auth.authMode();
        const userId = this.auth.currentUser()?.id;
        if (mode === 'supabase' && userId && this.sb.client) {
          void this.refreshFromBackend();
        }
      });
    }
  }

  async refreshFromBackend(): Promise<void> {
    if (!this.sb.client || !this.isBrowser) return;
    this.backendLoading.set(true);
    this.backendError.set(null);

    try {
      const [catRes, bizRes, srvRes, stfRes, revRes, slotRes, setRes] = await Promise.all([
        this.sb.client.from('categories').select('*').order('sort_order', { ascending: true }),
        this.sb.client.from('businesses').select('*').order('created_at', { ascending: false }),
        this.sb.client.from('services').select('*').order('sort_order', { ascending: true }),
        this.sb.client.from('staff_members').select('*'),
        this.sb.client.from('reviews').select('*').order('created_at', { ascending: false }),
        this.sb.client.from('booking_slots').select('*'),
        this.sb.client.from('platform_settings').select('*').eq('id', 1).maybeSingle(),
      ]);

      if (catRes.error) throw catRes.error;

      if (catRes.data) {
        const mappedCats: CategoryInfo[] = catRes.data.map((c: any) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          shortName: c.short_name,
          tagline: c.tagline || '',
          description: c.description || '',
          coverImage: c.cover_image || 'images/cat-hairdressers.jpg',
          popularTags: Array.isArray(c.popular_tags) ? c.popular_tags : [],
          isActive: c.is_active ?? true,
          sortOrder: c.sort_order ?? 0,
        }));
        this.categories.set(mappedCats);
        this.saveCategories(mappedCats);
      }

      if (bizRes.data) {
        const srvByBiz = new Map<string, ServiceItem[]>();
        for (const s of srvRes.data || []) {
          const list = srvByBiz.get(s.business_id) ?? [];
          list.push({
            id: s.legacy_id || s.id,
            businessId: s.business_id,
            name: s.name,
            categoryLabel: s.category_label || 'Service',
            price: Number(s.price),
            durationMinutes: Number(s.duration_minutes),
            description: s.description || '',
            imageUrl: s.image_url || undefined,
            isActive: s.is_active ?? true,
          });
          srvByBiz.set(s.business_id, list);
        }

        const stfByBiz = new Map<string, StaffMember[]>();
        for (const m of stfRes.data || []) {
          const list = stfByBiz.get(m.business_id) ?? [];
          list.push({
            id: m.legacy_id || m.id,
            name: m.name,
            role: m.role || 'Specialist',
            specialty: m.specialty || '',
            avatarColor: m.avatar_color || '#92745b',
            isActive: m.is_active ?? true,
          });
          stfByBiz.set(m.business_id, list);
        }

        const revByBiz = new Map<string, BusinessReview[]>();
        for (const r of revRes.data || []) {
          const list = revByBiz.get(r.business_id) ?? [];
          list.push({
            id: r.id,
            businessId: r.business_id,
            businessSlug: r.business_slug,
            author: r.author,
            rating: Number(r.rating),
            serviceName: r.service_name,
            dateLabel: r.date_label,
            comment: r.comment,
            status: r.status || 'published',
            createdAt: r.created_at,
          });
          revByBiz.set(r.business_id, list);
        }

        const mappedBiz: BusinessProfile[] = bizRes.data.map((b: any) => ({
          id: b.id,
          ownerId: b.owner_id,
          slug: b.slug,
          name: b.name,
          categorySlug: b.category_slug,
          categoryLabel: b.category_label,
          tagline: b.tagline || '',
          about: b.about || '',
          location: b.location,
          city: b.city,
          address: b.address || '',
          logoText: b.logo_text || b.name.slice(0, 2).toUpperCase(),
          logoBg: b.logo_bg || '#302c28',
          logoImage: b.logo_image || undefined,
          coverImage: b.cover_image || 'images/hero-salon.jpg',
          gallery: Array.isArray(b.gallery) ? b.gallery : [],
          rating: Number(b.rating ?? 5),
          reviewCount: Number(b.review_count ?? 0),
          verified: Boolean(b.verified),
          featured: Boolean(b.featured),
          status: b.status || 'active',
          services: srvByBiz.get(b.id) ?? [],
          staff: stfByBiz.get(b.id) ?? [],
          workingHours:
            Array.isArray(b.working_hours) && b.working_hours.length
              ? b.working_hours
              : DEFAULT_WORKING_HOURS,
          availabilitySettings: b.availability_settings
            ? { ...DEFAULT_AVAILABILITY, ...b.availability_settings }
            : { ...DEFAULT_AVAILABILITY },
          reviews: revByBiz.get(b.id) ?? [],
          contact: b.contact || { phone: '', email: '', instagram: '' },
          paymentPolicy: b.payment_policy || {
            allowFull: true,
            allowDeposit: true,
            depositPercent: 30,
            allowPayAtBusiness: true,
          },
          createdAt: b.created_at,
        }));

        this.businesses.set(mappedBiz);
        this.saveBusinesses(mappedBiz);
      }

      if (slotRes.data) {
        this.bookedSlotsExternal.set(
          slotRes.data.map((s: any) => ({
            businessSlug: s.business_slug,
            bookingDate: s.booking_date,
            bookingTime: s.booking_time,
            status: s.status,
          })),
        );
      }

      if (setRes.data) {
        const s = setRes.data;
        const mappedSettings: PlatformSettings = {
          commissionRate: Number(s.commission_rate ?? 10),
          vendorOnboardingFee: Number(s.vendor_onboarding_fee ?? 25000),
          siteName: s.site_name || 'Beautiva',
          heroHeadline: s.hero_headline || DEFAULT_PLATFORM_SETTINGS.heroHeadline,
          heroSubheadline: s.hero_subheadline || DEFAULT_PLATFORM_SETTINGS.heroSubheadline,
          announcementBanner: s.announcement_banner || '',
          supportEmail: s.support_email || 'concierge@beautiva.ng',
          supportPhone: s.support_phone || '+234 800 232 8848',
          notifyNewBooking: Boolean(s.notify_new_booking),
          notifyPaymentFailed: Boolean(s.notify_payment_failed),
          notifyVendorApplication: Boolean(s.notify_vendor_application),
          notifyBookingReminders: Boolean(s.notify_booking_reminders),
        };
        this.platformSettings.set(mappedSettings);
        this.saveSettings(mappedSettings);
      }

      // Scoped authenticated fetches (Super Admin / Vendor / Customer)
      if (this.auth.authMode() === 'supabase') {
        const [bkRes, txRes, invRes, profRes, appRes] = await Promise.all([
          this.sb.client.from('bookings').select('*').order('created_at', { ascending: false }),
          this.sb.client.from('transactions').select('*').order('created_at', { ascending: false }),
          this.sb.client
            .from('vendor_invitations')
            .select('*')
            .order('created_at', { ascending: false }),
          this.sb.client.from('profiles').select('*').order('created_at', { ascending: false }),
          this.sb.client
            .from('vendor_applications')
            .select('*')
            .order('created_at', { ascending: false }),
        ]);

        if (bkRes.data) {
          const mappedBookings = bkRes.data.map((b: any) => this.mapBookingRow(b));
          this.bookings.set(mappedBookings);
          this.saveBookings(mappedBookings);
        }

        if (txRes.data) {
          const mappedTx: TransactionRecord[] = txRes.data.map((t: any) => ({
            id: t.id,
            bookingId: t.booking_id || undefined,
            bookingReference: t.booking_reference,
            businessId: t.business_id,
            businessName: t.business_name,
            customerName: t.customer_name,
            customerEmail: t.customer_email,
            gateway: t.gateway || 'Paystack',
            gatewayReference: t.gateway_reference || undefined,
            amount: Number(t.amount),
            platformCommissionRate: Number(t.platform_commission_rate),
            platformCommissionAmount: Number(t.platform_commission_amount),
            vendorNetAmount: Number(t.vendor_net_amount),
            status: t.status,
            failureReason: t.failure_reason || undefined,
            paidAt: t.paid_at || undefined,
            createdAt: t.created_at,
          }));
          this.transactions.set(mappedTx);
          this.saveTransactions(mappedTx);
        }

        if (invRes.data) {
          const mappedInv: VendorInvitation[] = invRes.data.map((i: any) => ({
            id: i.id,
            email: i.email,
            businessName: i.business_name,
            categorySlug: i.category_slug || 'hairdressers',
            city: i.city || 'Lagos',
            inviteToken: i.invite_token,
            status: i.status,
            createdAt: i.created_at,
            expiresAt: i.expires_at,
          }));
          this.vendorInvitations.set(mappedInv);
          this.saveInvitations(mappedInv);
        }

        if (appRes.data) {
          const mappedApps: VendorApplication[] = appRes.data.map((a: any) =>
            this.mapApplicationRow(a),
          );
          this.vendorApplications.set(mappedApps);
          this.saveApplications(mappedApps);
        }

        if (profRes.data) {
          const mappedProfs: UserProfile[] = profRes.data.map((p: any) => ({
            id: p.id,
            email: p.email,
            fullName: p.full_name || p.email,
            phone: p.phone || '',
            role: p.role,
            status: p.status,
            avatarUrl: p.avatar_url || undefined,
            createdAt: p.created_at,
          }));
          this.customerAccounts.set(mappedProfs);
          this.saveCustomerAccounts(mappedProfs);
        }

        if (this.auth.isSuperAdmin()) {
          try {
            const { data: logRows, error: logErr } = await this.sb.client
              .from('activity_logs')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(200);
            if (!logErr && logRows) {
              const mappedLogs = logRows.map((r: any) => this.mapActivityLogRow(r));
              this.activityLogs.set(mappedLogs);
              this.saveActivityLogs(mappedLogs);
            }
          } catch {
            // Activity logs table optional until 004_activity_logs.sql is applied
          }

          try {
            const { data: credRows, error: credErr } = await this.sb.client
              .from('vendor_credentials')
              .select('*')
              .order('updated_at', { ascending: false });
            if (!credErr && credRows) {
              const mappedCreds: VendorCredentialRecord[] = credRows.map((c: any) => ({
                businessId: c.business_id || undefined,
                businessSlug: String(c.business_slug || '').toLowerCase(),
                email: String(c.email || '').toLowerCase(),
                tempPassword: String(c.temp_password || ''),
                updatedAt: c.updated_at || undefined,
              }));
              this.vendorCredentials.set(mappedCreds);
              this.saveVendorCredentials(mappedCreds);
            }
          } catch {
            // Vendor credentials table optional until 005_vendor_credentials.sql is applied
          }
        }
      }

      this.backendConnected.set(true);
    } catch (err: any) {
      this.backendConnected.set(false);
      this.backendError.set(err?.message || 'Unable to connect to Supabase backend');
    } finally {
      this.backendLoading.set(false);
    }
  }

  getCategoryBySlug(slug: string | null | undefined): CategoryInfo | undefined {
    if (!slug) return undefined;
    return this.categories().find((c) => c.slug === slug);
  }

  getBusinessesByCategory(slug: CategorySlug): BusinessProfile[] {
    return this.activeBusinesses().filter((b) => b.categorySlug === slug);
  }

  getBusinessBySlug(slug: string | null | undefined): BusinessProfile | undefined {
    if (!slug) return undefined;
    return this.businesses().find((b) => b.slug.toLowerCase() === slug.toLowerCase());
  }

  getActiveServices(business: BusinessProfile): ServiceItem[] {
    return (business.services || []).filter((s) => s.isActive !== false);
  }

  getStartingPrice(business: BusinessProfile): number {
    const active = this.getActiveServices(business);
    if (!active.length) return 0;
    return Math.min(...active.map((s) => s.price));
  }

  getAvailableCities(): string[] {
    const set = new Set<string>();
    for (const biz of this.businesses()) {
      if (biz.city) set.add(biz.city);
    }
    return Array.from(set).sort();
  }

  searchBusinesses(
    query: string,
    categorySlug?: CategorySlug | 'all',
    city?: string,
    onlyPayAtBusiness = false,
  ): BusinessProfile[] {
    const q = query.trim().toLowerCase();
    return this.activeBusinesses().filter((biz) => {
      if (categorySlug && categorySlug !== 'all' && biz.categorySlug !== categorySlug) {
        return false;
      }
      if (city && city !== 'all' && biz.city.toLowerCase() !== city.toLowerCase()) {
        return false;
      }
      if (onlyPayAtBusiness && !biz.paymentPolicy.allowPayAtBusiness) {
        return false;
      }
      if (!q) return true;
      const inName = biz.name.toLowerCase().includes(q);
      const inLoc = biz.location.toLowerCase().includes(q);
      const inCat = biz.categoryLabel.toLowerCase().includes(q);
      const inServices = this.getActiveServices(biz).some((s) =>
        s.name.toLowerCase().includes(q),
      );
      return inName || inLoc || inCat || inServices;
    });
  }

  isDateBlocked(business: BusinessProfile | undefined, dateIso: string): boolean {
    if (!business) return false;
    const blocked = business.availabilitySettings?.blockedDates ?? [];
    if (blocked.includes(dateIso)) return true;

    const d = new Date(`${dateIso}T00:00:00`);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[d.getDay()];
    const wh = business.workingHours.find((h) => h.day === dayName);
    return Boolean(wh?.closed);
  }

  getEnabledSlotsForBusiness(business: BusinessProfile | undefined, dateIso?: string): string[] {
    if (!business) return DEFAULT_TIME_SLOTS;
    if (dateIso && this.isDateBlocked(business, dateIso)) return [];
    const configured = business.availabilitySettings?.enabledSlots;
    return configured && configured.length > 0 ? configured : DEFAULT_TIME_SLOTS;
  }

  getBookedSlots(businessSlug: string, date: string): string[] {
    const localBooked = this.bookings()
      .filter(
        (b) => b.businessSlug === businessSlug && b.date === date && b.status !== 'Cancelled',
      )
      .map((b) => b.time);

    const extBooked = this.bookedSlotsExternal()
      .filter(
        (s) =>
          s.businessSlug === businessSlug && s.bookingDate === date && s.status !== 'Cancelled',
      )
      .map((s) => s.bookingTime);

    return Array.from(new Set([...localBooked, ...extBooked]));
  }

  createBooking(input: CreateBookingInput): BookingRecord {
    const biz = this.getBusinessBySlug(input.businessSlug);
    if (!biz) {
      throw new Error(`Business not found: ${input.businessSlug}`);
    }
    const service = biz.services.find((s) => s.id === input.serviceId);
    if (!service) {
      throw new Error(`Service not found: ${input.serviceId}`);
    }

    const depositPct = biz.paymentPolicy.depositPercent || 30;
    let amountPaid = 0;
    let balanceDue = service.price;
    let paymentStatus: PaymentStatus = 'Pay at Business';

    if (input.paymentOption === 'full') {
      amountPaid = service.price;
      balanceDue = 0;
      paymentStatus = 'Paid';
    } else if (input.paymentOption === 'deposit') {
      amountPaid = Math.round((service.price * depositPct) / 100);
      balanceDue = service.price - amountPaid;
      paymentStatus = 'Deposit Paid';
    }

    const bookingReference = this.generateNextBookingReference();
    const createdAt = new Date().toISOString();
    const customerId = this.auth.authMode() === 'supabase' ? this.auth.currentUser()?.id : null;

    const record: BookingRecord = {
      id: `bk-${Date.now()}`,
      bookingReference,
      businessId: biz.id,
      businessSlug: biz.slug,
      businessName: biz.name,
      businessLocation: biz.location,
      categorySlug: biz.categorySlug,
      serviceId: service.id,
      serviceName: service.name,
      servicePrice: service.price,
      serviceDurationMinutes: service.durationMinutes,
      date: input.date,
      dateDisplay: input.dateDisplay,
      time: input.time,
      staffName: input.staffName || 'Any available specialist',
      customerId,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      customerPhone: input.customerPhone.trim(),
      notes: input.notes?.trim() || undefined,
      paymentOption: input.paymentOption,
      amountPaid,
      balanceDue,
      paymentStatus,
      paystackReference: input.paystackReference,
      status: 'Confirmed',
      createdAt,
    };

    const updatedBookings = [record, ...this.bookings()];
    this.bookings.set(updatedBookings);
    this.saveBookings(updatedBookings);

    // Record transaction when online payment occurred
    let txRecord: TransactionRecord | null = null;
    if (amountPaid > 0) {
      const rate = this.platformSettings().commissionRate || 10;
      const comm = Math.round((amountPaid * rate) / 100);
      txRecord = {
        id: `tx-${Date.now()}`,
        bookingId: record.id,
        bookingReference,
        businessId: biz.id,
        businessName: biz.name,
        customerName: record.customerName,
        customerEmail: record.customerEmail,
        gateway: 'Paystack',
        gatewayReference: input.paystackReference || `PSK_${Date.now()}`,
        amount: amountPaid,
        platformCommissionRate: rate,
        platformCommissionAmount: comm,
        vendorNetAmount: amountPaid - comm,
        status: 'success',
        paidAt: createdAt,
        createdAt,
      };
      const updatedTx = [txRecord, ...this.transactions()];
      this.transactions.set(updatedTx);
      this.saveTransactions(updatedTx);
    }

    // Persist asynchronously to Supabase if configured
    if (this.sb.client && this.isBrowser && this.isUuid(biz.id)) {
      void this.persistBookingToSupabase(record, txRecord);
    }

    this.logActivity({
      eventType: 'booking.created',
      category: 'booking',
      actorName: record.customerName,
      actorEmail: record.customerEmail,
      actorRole: 'customer',
      entityType: 'booking',
      entityId: record.bookingReference,
      entityName: biz.name,
      summary: `Booked ${record.serviceName} at ${biz.name} for ${record.dateDisplay} at ${record.time} (${record.bookingReference}).`,
      metadata: {
        amountPaid: record.amountPaid,
        balanceDue: record.balanceDue,
        paymentStatus: record.paymentStatus,
      },
      createdAt,
    });

    if (txRecord) {
      this.logActivity({
        eventType: 'payment.success',
        category: 'transaction',
        actorName: txRecord.customerName,
        actorEmail: txRecord.customerEmail,
        actorRole: 'customer',
        entityType: 'transaction',
        entityId: txRecord.gatewayReference || txRecord.id,
        entityName: txRecord.businessName,
        summary: `Payment of ${this.formatNaira(txRecord.amount)} succeeded via ${txRecord.gateway} for ${txRecord.bookingReference}.`,
        metadata: {
          amount: txRecord.amount,
          commission: txRecord.platformCommissionAmount,
          vendorNet: txRecord.vendorNetAmount,
        },
        createdAt,
      });
    }

    return record;
  }

  private async persistBookingToSupabase(
    record: BookingRecord,
    tx: TransactionRecord | null,
  ): Promise<void> {
    if (!this.sb.client) return;
    const { error } = await this.sb.client.from('bookings').insert({
      booking_reference: record.bookingReference,
      business_id: record.businessId,
      business_slug: record.businessSlug,
      business_name: record.businessName,
      business_location: record.businessLocation,
      category_slug: record.categorySlug || '',
      service_id: record.serviceId,
      service_name: record.serviceName,
      service_price: record.servicePrice,
      service_duration_minutes: record.serviceDurationMinutes,
      date: record.date,
      date_display: record.dateDisplay,
      time: record.time,
      staff_name: record.staffName,
      customer_id: record.customerId || null,
      customer_name: record.customerName,
      customer_email: record.customerEmail,
      customer_phone: record.customerPhone,
      notes: record.notes || null,
      payment_option: record.paymentOption,
      amount_paid: record.amountPaid,
      balance_due: record.balanceDue,
      payment_status: record.paymentStatus,
      paystack_reference: record.paystackReference || null,
      status: record.status,
      created_at: record.createdAt,
    });

    if (!error && tx) {
      await this.sb.client.from('transactions').insert({
        booking_reference: tx.bookingReference,
        business_id: tx.businessId,
        business_name: tx.businessName,
        customer_name: tx.customerName,
        customer_email: tx.customerEmail,
        gateway: tx.gateway,
        gateway_reference: tx.gatewayReference,
        amount: tx.amount,
        platform_commission_rate: tx.platformCommissionRate,
        platform_commission_amount: tx.platformCommissionAmount,
        vendor_net_amount: tx.vendorNetAmount,
        status: tx.status,
        paid_at: tx.paidAt,
        created_at: tx.createdAt,
      });
    }
  }

  recordFailedPayment(input: {
    businessSlug: string;
    customerName: string;
    customerEmail: string;
    amount: number;
    reason: string;
    gatewayReference?: string;
  }): TransactionRecord {
    const biz = this.getBusinessBySlug(input.businessSlug);
    const createdAt = new Date().toISOString();
    const tx: TransactionRecord = {
      id: `tx-fail-${Date.now()}`,
      bookingReference: 'UNCOMPLETED',
      businessId: biz?.id,
      businessName: biz?.name || input.businessSlug,
      customerName: input.customerName || 'Guest Customer',
      customerEmail: input.customerEmail || 'guest@beautiva.ng',
      gateway: 'Paystack',
      gatewayReference: input.gatewayReference || `PSK_FAIL_${Date.now()}`,
      amount: input.amount,
      platformCommissionRate: this.platformSettings().commissionRate,
      platformCommissionAmount: 0,
      vendorNetAmount: 0,
      status: 'failed',
      failureReason: input.reason,
      createdAt,
    };
    const updated = [tx, ...this.transactions()];
    this.transactions.set(updated);
    this.saveTransactions(updated);

    if (this.sb.client && this.isBrowser && biz && this.isUuid(biz.id)) {
      this.runSupabaseWrite(
        this.sb.client.from('transactions').insert({
          booking_reference: tx.bookingReference,
          business_id: biz.id,
          business_name: tx.businessName,
          customer_name: tx.customerName,
          customer_email: tx.customerEmail,
          gateway: tx.gateway,
          gateway_reference: tx.gatewayReference,
          amount: tx.amount,
          platform_commission_rate: tx.platformCommissionRate,
          platform_commission_amount: 0,
          vendor_net_amount: 0,
          status: 'failed',
          failure_reason: tx.failureReason,
          created_at: tx.createdAt,
        }),
      );
    }

    this.logActivity({
      eventType: 'payment.failed',
      category: 'transaction',
      actorName: tx.customerName,
      actorEmail: tx.customerEmail,
      actorRole: 'customer',
      entityType: 'transaction',
      entityId: tx.gatewayReference || tx.id,
      entityName: tx.businessName,
      summary: `Payment of ${this.formatNaira(tx.amount)} failed at ${tx.businessName}: ${tx.failureReason}.`,
      metadata: { amount: tx.amount, reason: tx.failureReason },
      createdAt,
    });

    return tx;
  }

  findBookingByReference(reference: string): BookingRecord | undefined {
    const normalized = reference.trim().toUpperCase();
    if (!normalized) return undefined;
    return this.bookings().find((b) => b.bookingReference.toUpperCase() === normalized);
  }

  async lookupBookingRemote(reference: string): Promise<BookingRecord | undefined> {
    const local = this.findBookingByReference(reference);
    if (local) return local;
    if (!this.isBrowser) return undefined;

    try {
      const resp = await fetch(`/api/public/track/${encodeURIComponent(reference.trim())}`);
      if (resp.ok) {
        const json = await resp.json();
        if (json.booking) {
          return this.mapBookingRow(json.booking);
        }
      }
    } catch {
      // Ignore SSR lookup errors
    }
    return undefined;
  }

  updateBookingStatus(
    reference: string,
    status: BookingStatus,
    paymentStatus?: PaymentStatus,
  ): BookingRecord | undefined {
    let target: BookingRecord | undefined;
    let settledAmount = 0;
    const updated = this.bookings().map((b) => {
      if (b.bookingReference.toUpperCase() !== reference.trim().toUpperCase()) {
        return b;
      }
      if (paymentStatus === 'Paid' && b.balanceDue > 0) {
        settledAmount = b.balanceDue;
      }
      target = {
        ...b,
        status,
        paymentStatus: paymentStatus ?? b.paymentStatus,
        amountPaid: paymentStatus === 'Paid' ? b.servicePrice : b.amountPaid,
        balanceDue: paymentStatus === 'Paid' ? 0 : b.balanceDue,
      };
      return target;
    });

    if (target) {
      this.bookings.set(updated);
      this.saveBookings(updated);

      if (this.sb.client && this.isBrowser) {
        this.runSupabaseWrite(
          this.sb.client
            .from('bookings')
            .update({
              status: target.status,
              payment_status: target.paymentStatus,
              amount_paid: target.amountPaid,
              balance_due: target.balanceDue,
            })
            .ilike('booking_reference', target.bookingReference),
        );
      }

      if (settledAmount > 0) {
        const nowIso = new Date().toISOString();
        const rate = this.platformSettings().commissionRate || 10;
        const comm = Math.round((settledAmount * rate) / 100);
        const settlementTx: TransactionRecord = {
          id: `tx-settle-${Date.now()}`,
          bookingId: target.id,
          bookingReference: target.bookingReference,
          businessId: target.businessId,
          businessName: target.businessName,
          customerName: target.customerName,
          customerEmail: target.customerEmail,
          gateway: 'Studio Balance Settlement',
          gatewayReference: `BAL_${target.bookingReference}_${Date.now()}`,
          amount: settledAmount,
          platformCommissionRate: rate,
          platformCommissionAmount: comm,
          vendorNetAmount: settledAmount - comm,
          status: 'success',
          paidAt: nowIso,
          createdAt: nowIso,
        };
        const updatedTx = [settlementTx, ...this.transactions()];
        this.transactions.set(updatedTx);
        this.saveTransactions(updatedTx);

        if (this.sb.client && this.isBrowser && target.businessId && this.isUuid(target.businessId)) {
          this.runSupabaseWrite(
            this.sb.client.from('transactions').insert({
              booking_reference: settlementTx.bookingReference,
              business_id: target.businessId,
              business_name: settlementTx.businessName,
              customer_name: settlementTx.customerName,
              customer_email: settlementTx.customerEmail,
              gateway: settlementTx.gateway,
              gateway_reference: settlementTx.gatewayReference,
              amount: settlementTx.amount,
              platform_commission_rate: settlementTx.platformCommissionRate,
              platform_commission_amount: settlementTx.platformCommissionAmount,
              vendor_net_amount: settlementTx.vendorNetAmount,
              status: settlementTx.status,
              paid_at: settlementTx.paidAt,
              created_at: settlementTx.createdAt,
            }),
          );
        }

        this.logActivity({
          eventType: 'payment.balance_settled',
          category: 'transaction',
          entityType: 'transaction',
          entityId: settlementTx.gatewayReference,
          entityName: target.businessName,
          summary: `Settled remaining balance of ${this.formatNaira(settledAmount)} for booking ${target.bookingReference} (${target.businessName}).`,
          metadata: { amount: settledAmount, bookingReference: target.bookingReference },
          createdAt: nowIso,
        });
      }

      this.logActivity({
        eventType: 'booking.status_updated',
        category: 'booking',
        entityType: 'booking',
        entityId: target.bookingReference,
        entityName: target.businessName,
        summary: `Booking ${target.bookingReference} marked ${target.status} (${target.paymentStatus}).`,
      });
    }
    return target;
  }

  rescheduleBooking(
    reference: string,
    newDate: string,
    newDateDisplay: string,
    newTime: string,
  ): BookingRecord | undefined {
    let target: BookingRecord | undefined;
    const updated = this.bookings().map((b) => {
      if (b.bookingReference.toUpperCase() !== reference.trim().toUpperCase()) {
        return b;
      }
      target = {
        ...b,
        rescheduledFrom: `${b.dateDisplay} · ${b.time}`,
        date: newDate,
        dateDisplay: newDateDisplay,
        time: newTime,
        status: b.status === 'Cancelled' ? 'Confirmed' : b.status,
      };
      return target;
    });

    if (target) {
      this.bookings.set(updated);
      this.saveBookings(updated);
      if (this.sb.client && this.isBrowser) {
        this.runSupabaseWrite(
          this.sb.client
            .from('bookings')
            .update({
              date: target.date,
              date_display: target.dateDisplay,
              time: target.time,
              status: target.status,
              rescheduled_from: target.rescheduledFrom,
            })
            .ilike('booking_reference', target.bookingReference),
        );
      }

      this.logActivity({
        eventType: 'booking.rescheduled',
        category: 'booking',
        entityType: 'booking',
        entityId: target.bookingReference,
        entityName: target.businessName,
        summary: `Rescheduled booking ${target.bookingReference} to ${newDateDisplay} at ${newTime}.`,
      });
    }
    return target;
  }

  addReview(businessSlug: string, review: Omit<BusinessReview, 'id' | 'dateLabel'>): void {
    let targetBizId: string | undefined;
    let targetBizName = businessSlug;
    const reviewId = `rev-${Date.now()}`;
    const updated = this.businesses().map((biz) => {
      if (biz.slug !== businessSlug) return biz;
      targetBizId = biz.id;
      targetBizName = biz.name;
      const newRev: BusinessReview = {
        ...review,
        id: reviewId,
        businessId: biz.id,
        businessSlug: biz.slug,
        dateLabel: 'Just now',
        status: 'published',
      };
      const reviews = [newRev, ...biz.reviews];
      const totalScore = biz.rating * biz.reviewCount + review.rating;
      const newCount = biz.reviewCount + 1;
      const newRating = Number((totalScore / newCount).toFixed(1));
      return {
        ...biz,
        reviews,
        reviewCount: newCount,
        rating: newRating,
      };
    });
    this.businesses.set(updated);
    this.saveBusinesses(updated);

    if (this.sb.client && this.isBrowser && targetBizId && this.isUuid(targetBizId)) {
      this.runSupabaseWrite(
        this.sb.client.from('reviews').insert({
          business_id: targetBizId,
          business_slug: businessSlug,
          author: review.author,
          rating: review.rating,
          service_name: review.serviceName,
          date_label: 'Just now',
          comment: review.comment,
          status: 'published',
        }),
      );
    }

    this.logActivity({
      eventType: 'review.created',
      category: 'review',
      actorName: review.author,
      actorRole: 'customer',
      entityType: 'business',
      entityId: businessSlug,
      entityName: targetBizName,
      summary: `${review.author} left a ${review.rating}★ review for ${targetBizName} (${review.serviceName}).`,
    });
  }

  upsertBusiness(
    input: Omit<BusinessProfile, 'id' | 'rating' | 'reviewCount' | 'reviews' | 'verified'> & {
      id?: string;
      verified?: boolean;
    },
  ): BusinessProfile {
    const existing = this.getBusinessBySlug(input.slug);
    const category = this.getCategoryBySlug(input.categorySlug);
    const newId = existing?.id ?? input.id ?? this.generateUuid();
    const ownerId =
      input.ownerId ??
      existing?.ownerId ??
      (this.auth.authMode() === 'supabase' ? this.auth.currentUser()?.id ?? null : null);

    const record: BusinessProfile = {
      ...input,
      id: newId,
      ownerId,
      categoryLabel: category?.name ?? input.categoryLabel,
      workingHours: input.workingHours?.length ? input.workingHours : DEFAULT_WORKING_HOURS,
      availabilitySettings: input.availabilitySettings ?? existing?.availabilitySettings ?? { ...DEFAULT_AVAILABILITY },
      rating: existing?.rating ?? 5.0,
      reviewCount: existing?.reviewCount ?? 1,
      verified: input.verified ?? existing?.verified ?? true,
      reviews: existing?.reviews ?? [
        {
          id: `rev-init-${Date.now()}`,
          author: 'Beautiva Concierge',
          rating: 5,
          serviceName: input.services[0]?.name || 'Signature Session',
          dateLabel: 'New studio',
          comment: 'Verified studio profile automatically generated on Beautiva.',
          status: 'published',
        },
      ],
    };

    const list = existing
      ? this.businesses().map((b) => (b.slug === existing.slug ? record : b))
      : [record, ...this.businesses()];

    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(record.id)) {
      void this.persistBusinessToSupabase(record);
    }

    this.logActivity({
      eventType: existing ? 'vendor.updated' : 'vendor.created',
      category: 'vendor',
      entityType: 'business',
      entityId: record.slug,
      entityName: record.name,
      summary: `${existing ? 'Updated' : 'Created'} vendor studio "${record.name}" (${record.location}).`,
    });

    return record;
  }

  private async persistBusinessToSupabase(record: BusinessProfile): Promise<void> {
    if (!this.sb.client) return;
    const { error } = await this.sb.client.from('businesses').upsert(
      {
        id: record.id,
        owner_id: record.ownerId || null,
        slug: record.slug,
        name: record.name,
        category_slug: record.categorySlug,
        category_label: record.categoryLabel,
        tagline: record.tagline,
        about: record.about,
        location: record.location,
        city: record.city,
        address: record.address,
        logo_text: record.logoText,
        logo_bg: record.logoBg,
        logo_image: record.logoImage || null,
        cover_image: record.coverImage,
        gallery: record.gallery,
        rating: record.rating,
        review_count: record.reviewCount,
        verified: record.verified,
        featured: record.featured,
        status: record.status ?? 'active',
        working_hours: record.workingHours,
        availability_settings: record.availabilitySettings ?? DEFAULT_AVAILABILITY,
        contact: record.contact,
        payment_policy: record.paymentPolicy,
      },
      { onConflict: 'slug' },
    );

    if (!error) {
      await this.syncBusinessServicesToSupabase(record.id, record.services);
      await this.syncBusinessStaffToSupabase(record.id, record.staff);
    }
  }

  private async syncBusinessServicesToSupabase(
    businessId: string,
    services: ServiceItem[],
  ): Promise<void> {
    if (!this.sb.client || !this.isUuid(businessId)) return;
    await this.sb.client.from('services').delete().eq('business_id', businessId);
    if (services.length === 0) return;

    await this.sb.client.from('services').insert(
      services.map((s, idx) => ({
        business_id: businessId,
        legacy_id: s.id,
        name: s.name,
        category_label: s.categoryLabel || 'Service',
        price: s.price,
        duration_minutes: s.durationMinutes,
        description: s.description || '',
        image_url: s.imageUrl || null,
        is_active: s.isActive !== false,
        sort_order: idx + 1,
      })),
    );
  }

  private async syncBusinessStaffToSupabase(
    businessId: string,
    staff: StaffMember[],
  ): Promise<void> {
    if (!this.sb.client || !this.isUuid(businessId)) return;
    await this.sb.client.from('staff_members').delete().eq('business_id', businessId);
    if (staff.length === 0) return;

    await this.sb.client.from('staff_members').insert(
      staff.map((m) => ({
        business_id: businessId,
        legacy_id: m.id,
        name: m.name,
        role: m.role || 'Specialist',
        specialty: m.specialty || '',
        avatar_color: m.avatarColor || '#92745b',
        is_active: m.isActive !== false,
      })),
    );
  }

  private runSupabaseWrite(op: PromiseLike<{ error?: { message?: string } | null }>): void {
    void Promise.resolve(op).then(
      (res) => {
        if (res?.error?.message) {
          this.backendError.set(res.error.message);
        }
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unable to sync change to Supabase';
        this.backendError.set(msg);
      },
    );
  }

  private async persistBusinessMutation(
    method: 'PATCH' | 'DELETE',
    bizId: string,
    slug: string,
    payload?: Record<string, unknown>,
    extraSync?: () => Promise<void>,
  ): Promise<{ ok: boolean; error?: string }> {
    if (
      !this.sb.client ||
      !this.isBrowser ||
      !this.isUuid(bizId) ||
      this.auth.authMode() !== 'supabase'
    ) {
      return { ok: true };
    }

    const idOrSlug = this.isUuid(bizId) ? bizId : slug;
    const token = this.auth.accessToken();

    // Super Admin requests can use the server route (bypasses brittle client RLS edge cases)
    if (this.auth.authMode() === 'supabase' && this.auth.isSuperAdmin() && token) {
      try {
        const resp = await fetch(`/api/admin/businesses/${encodeURIComponent(idOrSlug)}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: method === 'PATCH' ? JSON.stringify(payload || {}) : undefined,
        });
        if (resp.ok) {
          if (extraSync) await extraSync();
          return { ok: true };
        }
        if (resp.status !== 404 && resp.status !== 503) {
          const errJson = (await resp.json().catch(() => ({}))) as { error?: string };
          return { ok: false, error: errJson.error || `Server returned ${resp.status}` };
        }
      } catch {
        // Fall through to direct Supabase client update below
      }
    }

    if (method === 'DELETE') {
      const { data, error } = await this.sb.client
        .from('businesses')
        .delete()
        .eq('id', bizId)
        .select('id')
        .maybeSingle();

      if (error) {
        return { ok: false, error: error.message };
      }
      if (this.auth.authMode() === 'supabase' && !data) {
        return { ok: false, error: 'Studio delete was rejected by Supabase RLS or not found.' };
      }
      return { ok: true };
    }

    const { data, error } = await this.sb.client
      .from('businesses')
      .update(payload || {})
      .eq('id', bizId)
      .select('id')
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }
    if (this.auth.authMode() === 'supabase' && !data) {
      return { ok: false, error: 'Studio update was rejected by Supabase RLS or not found.' };
    }

    if (extraSync) await extraSync();
    return { ok: true };
  }

  private applyStudioPatchLocal(
    slug: string,
    patch: Parameters<MarketplaceService['updateStudioConfiguration']>[1],
  ): { previous: BusinessProfile[]; updatedBiz?: BusinessProfile } {
    const previous = this.businesses();
    let updatedBiz: BusinessProfile | undefined;
    const category = patch.categorySlug ? this.getCategoryBySlug(patch.categorySlug) : undefined;

    const list = previous.map((b) => {
      if (b.slug !== slug) return b;
      updatedBiz = {
        ...b,
        ...patch,
        categoryLabel: category?.name ?? b.categoryLabel,
      };
      return updatedBiz;
    });

    if (updatedBiz) {
      this.businesses.set(list);
      this.saveBusinesses(list);
    }

    return { previous, updatedBiz };
  }

  private buildBusinessUpdatePayload(biz: BusinessProfile): Record<string, unknown> {
    return {
      name: biz.name,
      category_slug: biz.categorySlug,
      category_label: biz.categoryLabel,
      tagline: biz.tagline,
      about: biz.about,
      location: biz.location,
      city: biz.city,
      address: biz.address,
      logo_image: biz.logoImage || null,
      cover_image: biz.coverImage,
      gallery: biz.gallery,
      working_hours: biz.workingHours,
      availability_settings: biz.availabilitySettings ?? DEFAULT_AVAILABILITY,
      contact: biz.contact,
      payment_policy: biz.paymentPolicy,
      verified: biz.verified,
      featured: biz.featured,
      status: biz.status ?? 'active',
    };
  }

  updateStudioConfiguration(
    slug: string,
    patch: {
      name?: string;
      services?: ServiceItem[];
      staff?: StaffMember[];
      workingHours?: WorkingHours[];
      availabilitySettings?: AvailabilitySettings;
      paymentPolicy?: PaymentPolicy;
      tagline?: string;
      about?: string;
      logoImage?: string;
      coverImage?: string;
      gallery?: string[];
      location?: string;
      city?: string;
      address?: string;
      contact?: BusinessContact;
      categorySlug?: CategorySlug;
      verified?: boolean;
      featured?: boolean;
      status?: StudioStatus;
    },
  ): BusinessProfile | undefined {
    const { updatedBiz } = this.applyStudioPatchLocal(slug, patch);

    if (updatedBiz) {
      const biz = updatedBiz;
      void this.persistBusinessMutation(
        'PATCH',
        biz.id,
        biz.slug,
        this.buildBusinessUpdatePayload(biz),
        async () => {
          if (patch.services) {
            await this.syncBusinessServicesToSupabase(biz.id, biz.services);
          }
          if (patch.staff) {
            await this.syncBusinessStaffToSupabase(biz.id, biz.staff);
          }
        },
      );
      this.logActivity({
        eventType: 'vendor.updated',
        category: 'vendor',
        entityType: 'business',
        entityId: biz.slug,
        entityName: biz.name,
        summary: `Updated studio profile/configuration for ${biz.name}.`,
      });
    }
    return updatedBiz;
  }

  async saveStudioConfiguration(
    slug: string,
    patch: Parameters<MarketplaceService['updateStudioConfiguration']>[1],
  ): Promise<{ ok: boolean; business?: BusinessProfile; error?: string }> {
    const { previous, updatedBiz } = this.applyStudioPatchLocal(slug, patch);
    if (!updatedBiz) {
      return { ok: false, error: `Studio ${slug} not found.` };
    }

    const res = await this.persistBusinessMutation(
      'PATCH',
      updatedBiz.id,
      updatedBiz.slug,
      this.buildBusinessUpdatePayload(updatedBiz),
      async () => {
        if (patch.services) {
          await this.syncBusinessServicesToSupabase(updatedBiz.id, updatedBiz.services);
        }
        if (patch.staff) {
          await this.syncBusinessStaffToSupabase(updatedBiz.id, updatedBiz.staff);
        }
      },
    );

    if (!res.ok && this.auth.authMode() === 'supabase') {
      this.businesses.set(previous);
      this.saveBusinesses(previous);
      return { ok: false, error: res.error };
    }

    this.logActivity({
      eventType: 'vendor.updated',
      category: 'vendor',
      entityType: 'business',
      entityId: updatedBiz.slug,
      entityName: updatedBiz.name,
      summary: `Saved studio configuration for ${updatedBiz.name}.`,
    });

    return { ok: true, business: updatedBiz };
  }

  async setBusinessStatus(
    slug: string,
    status: StudioStatus,
  ): Promise<{ ok: boolean; error?: string }> {
    const previous = this.businesses();
    const existing = this.getBusinessBySlug(slug);
    if (!existing) return { ok: false, error: `Studio ${slug} not found.` };

    const nextVerified = status === 'active' ? true : existing.verified;
    const list = previous.map((b) =>
      b.slug === slug ? { ...b, status, verified: nextVerified } : b,
    );
    this.businesses.set(list);
    this.saveBusinesses(list);

    const res = await this.persistBusinessMutation('PATCH', existing.id, slug, {
      status,
      verified: nextVerified,
    });
    if (!res.ok && this.auth.authMode() === 'supabase') {
      this.businesses.set(previous);
      this.saveBusinesses(previous);
      return res;
    }
    this.logActivity({
      eventType: 'vendor.status_changed',
      category: 'vendor',
      entityType: 'business',
      entityId: slug,
      entityName: existing.name,
      summary: `Studio "${existing.name}" status changed to ${status}.`,
    });
    return { ok: true };
  }

  async deleteBusiness(slug: string): Promise<{ ok: boolean; error?: string }> {
    const previous = this.businesses();
    const existing = this.getBusinessBySlug(slug);
    if (!existing) return { ok: false, error: `Studio ${slug} not found.` };

    const list = previous.filter((b) => b.slug !== slug);
    this.businesses.set(list);
    this.saveBusinesses(list);

    const res = await this.persistBusinessMutation('DELETE', existing.id, slug);
    if (!res.ok && this.auth.authMode() === 'supabase') {
      this.businesses.set(previous);
      this.saveBusinesses(previous);
      return res;
    }
    this.logActivity({
      eventType: 'vendor.deleted',
      category: 'vendor',
      entityType: 'business',
      entityId: slug,
      entityName: existing.name,
      summary: `Deleted vendor studio "${existing.name}".`,
    });
    return { ok: true };
  }

  async toggleBusinessVerified(slug: string): Promise<{ ok: boolean; verified?: boolean; error?: string }> {
    const previous = this.businesses();
    const existing = this.getBusinessBySlug(slug);
    if (!existing) return { ok: false, error: `Studio ${slug} not found.` };

    const nextVal = !existing.verified;
    const list = previous.map((b) => (b.slug === slug ? { ...b, verified: nextVal } : b));
    this.businesses.set(list);
    this.saveBusinesses(list);

    const res = await this.persistBusinessMutation('PATCH', existing.id, slug, {
      verified: nextVal,
    });
    if (!res.ok && this.auth.authMode() === 'supabase') {
      this.businesses.set(previous);
      this.saveBusinesses(previous);
      return { ok: false, error: res.error };
    }
    this.logActivity({
      eventType: 'vendor.verified_toggled',
      category: 'vendor',
      entityType: 'business',
      entityId: slug,
      entityName: existing.name,
      summary: `${nextVal ? 'Verified' : 'Unverified'} studio "${existing.name}".`,
    });
    return { ok: true, verified: nextVal };
  }

  async toggleBusinessFeatured(slug: string): Promise<{ ok: boolean; featured?: boolean; error?: string }> {
    const previous = this.businesses();
    const existing = this.getBusinessBySlug(slug);
    if (!existing) return { ok: false, error: `Studio ${slug} not found.` };

    const nextVal = !existing.featured;
    const list = previous.map((b) => (b.slug === slug ? { ...b, featured: nextVal } : b));
    this.businesses.set(list);
    this.saveBusinesses(list);

    const res = await this.persistBusinessMutation('PATCH', existing.id, slug, {
      featured: nextVal,
    });
    if (!res.ok && this.auth.authMode() === 'supabase') {
      this.businesses.set(previous);
      this.saveBusinesses(previous);
      return { ok: false, error: res.error };
    }
    this.logActivity({
      eventType: 'vendor.featured_toggled',
      category: 'vendor',
      entityType: 'business',
      entityId: slug,
      entityName: existing.name,
      summary: `${nextVal ? 'Featured' : 'Unfeatured'} studio "${existing.name}".`,
    });
    return { ok: true, featured: nextVal };
  }

  // ============================================================================
  // SUPER ADMIN: CATEGORY MANAGEMENT
  // ============================================================================
  upsertCategory(input: CategoryInfo): CategoryInfo {
    const slug = this.slugify(input.slug || input.name);
    const existing = this.getCategoryBySlug(slug);
    const record: CategoryInfo = {
      ...input,
      id: existing?.id ?? input.id ?? this.generateUuid(),
      slug,
      shortName: input.shortName.trim() || input.name.trim(),
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? this.categories().length + 1,
    };

    const list = existing
      ? this.categories().map((c) => (c.slug === slug ? record : c))
      : [...this.categories(), record];
    this.categories.set(list);
    this.saveCategories(list);

    if (this.sb.client && this.isBrowser) {
      this.runSupabaseWrite(
        this.sb.client.from('categories').upsert(
          {
            id: this.isUuid(record.id) ? record.id : undefined,
            slug: record.slug,
            name: record.name,
            short_name: record.shortName,
            tagline: record.tagline,
            description: record.description,
            cover_image: record.coverImage,
            popular_tags: record.popularTags,
            is_active: record.isActive ?? true,
            sort_order: record.sortOrder ?? 1,
          },
          { onConflict: 'slug' },
        ),
      );
    }

    this.logActivity({
      eventType: existing ? 'category.updated' : 'category.created',
      category: 'category',
      entityType: 'category',
      entityId: record.slug,
      entityName: record.name,
      summary: `${existing ? 'Updated' : 'Created'} category "${record.name}" (/${record.slug}).`,
    });

    return record;
  }

  deleteCategory(slug: string): void {
    const existing = this.getCategoryBySlug(slug);
    const list = this.categories().filter((c) => c.slug !== slug);
    this.categories.set(list);
    this.saveCategories(list);

    if (this.sb.client && this.isBrowser) {
      this.runSupabaseWrite(this.sb.client.from('categories').delete().eq('slug', slug));
    }

    this.logActivity({
      eventType: 'category.deleted',
      category: 'category',
      entityType: 'category',
      entityId: slug,
      entityName: existing?.name || slug,
      summary: `Deleted category "${existing?.name || slug}".`,
    });
  }

  // ============================================================================
  // SUPER ADMIN: VENDOR INVITATIONS & ACCOUNT CREATION
  // ============================================================================
  async createVendorAccount(input: {
    fullName: string;
    email: string;
    password?: string;
    phone: string;
    businessName: string;
    categorySlug: CategorySlug;
    city: string;
    location: string;
  }): Promise<{ ok: boolean; business: BusinessProfile; authProvisioned: boolean; message: string }> {
    let ownerId: string | null = null;
    let authProvisioned = false;
    let message = `Studio "${input.businessName}" created and ready.`;

    const cat = this.getCategoryBySlug(input.categorySlug);
    const slug = this.slugify(input.businessName) || `studio-${Date.now()}`;
    const normalizedEmail = input.email.trim().toLowerCase();

    const token = this.auth.accessToken();
    if (this.isBrowser && input.password && token) {
      try {
        const resp = await fetch('/api/admin/create-vendor-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: normalizedEmail,
            password: input.password,
            fullName: input.fullName,
            phone: input.phone,
            businessSlug: slug,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          ownerId = data.userId;
          authProvisioned = true;
          message = `Vendor login (${normalizedEmail}) & studio "${input.businessName}" created. The vendor can now sign in at /auth.`;
        } else {
          const errJson = await resp.json().catch(() => ({}));
          if (errJson?.error) {
            message = `Studio created, but Supabase Auth user failed: ${errJson.error}`;
          }
        }
      } catch {
        message = `Studio "${input.businessName}" created locally. Sign in with a Supabase Super Admin session to provision live Auth credentials.`;
      }
    } else if (!token) {
      message = `Studio "${input.businessName}" created in preview mode. Sign in with a real Supabase Super Admin account at /auth to provision live vendor login credentials.`;
    }

    if (!authProvisioned) {
      this.inviteVendor({
        email: normalizedEmail,
        businessName: input.businessName,
        categorySlug: input.categorySlug,
        city: input.city,
      });
    }

    const words = input.businessName.trim().split(/\s+/);
    const logoText =
      words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : input.businessName.trim().slice(0, 2).toUpperCase();

    const business = this.upsertBusiness({
      ownerId,
      slug,
      name: input.businessName.trim(),
      categorySlug: input.categorySlug,
      categoryLabel: cat?.name ?? 'Beauty Studio',
      tagline: `Curated ${cat?.shortName || 'beauty'} services in ${input.city}.`,
      about: `${input.businessName.trim()} is an approved Beautiva partner studio in ${input.location}.`,
      location: input.location.trim() || `${input.city}`,
      city: input.city.trim() || 'Lagos',
      address: input.location.trim() || `${input.city}`,
      logoText,
      logoBg: '#302c28',
      coverImage: cat?.coverImage || 'images/hero-salon.jpg',
      gallery: [],
      featured: false,
      verified: true,
      status: 'active',
      services: [
        {
          id: `srv-${Date.now()}`,
          name: 'Signature Session',
          categoryLabel: cat?.shortName || 'Signature',
          price: 20000,
          durationMinutes: 60,
          description: 'Personalized studio session with consultation.',
          isActive: true,
        },
      ],
      staff: [
        {
          id: `stf-${Date.now()}`,
          name: input.fullName.trim() || 'Lead Specialist',
          role: 'Founder & Lead Artist',
          specialty: cat?.shortName || 'Studio Craft',
          avatarColor: '#92745b',
        },
      ],
      workingHours: DEFAULT_WORKING_HOURS,
      contact: {
        phone: input.phone.trim() || '+234 800 000 0000',
        email: input.email.trim().toLowerCase(),
        instagram: `@${slug}`,
      },
      paymentPolicy: {
        allowFull: true,
        allowDeposit: true,
        depositPercent: 30,
        allowPayAtBusiness: true,
      },
    });

    if (input.password) {
      this.recordVendorCredential({
        businessId: business.id,
        businessSlug: business.slug,
        email: normalizedEmail,
        tempPassword: input.password,
        updatedAt: new Date().toISOString(),
      });
      if (!authProvisioned) {
        this.auth.registerLocalVendorCredentials({
          email: normalizedEmail,
          password: input.password,
          fullName: input.fullName.trim() || business.name,
          phone: input.phone.trim(),
          studioSlug: business.slug,
        });
      }
    }

    this.logActivity({
      eventType: 'vendor.account_created',
      category: 'vendor',
      entityType: 'business',
      entityId: business.slug,
      entityName: business.name,
      summary: `Created vendor account & studio "${business.name}" (${normalizedEmail}).`,
    });

    return { ok: true, business, authProvisioned, message };
  }

  inviteVendor(input: {
    email: string;
    businessName: string;
    categorySlug: CategorySlug;
    city: string;
  }): VendorInvitation {
    const invite: VendorInvitation = {
      id: this.generateUuid(),
      email: input.email.trim().toLowerCase(),
      businessName: input.businessName.trim(),
      categorySlug: input.categorySlug,
      city: input.city.trim() || 'Lagos',
      inviteToken: `inv-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    };

    const list = [invite, ...this.vendorInvitations()];
    this.vendorInvitations.set(list);
    this.saveInvitations(list);

    if (this.sb.client && this.isBrowser) {
      this.runSupabaseWrite(
        this.sb.client.from('vendor_invitations').insert({
          id: invite.id,
          email: invite.email,
          business_name: invite.businessName,
          category_slug: invite.categorySlug,
          city: invite.city,
          invite_token: invite.inviteToken,
          status: invite.status,
        }),
      );
    }

    this.logActivity({
      eventType: 'vendor.invited',
      category: 'vendor',
      entityType: 'invitation',
      entityId: invite.id,
      entityName: invite.businessName,
      summary: `Sent vendor invitation to ${invite.email} for "${invite.businessName}".`,
    });
    return invite;
  }

  revokeInvitation(id: string): void {
    const existing = this.vendorInvitations().find((i) => i.id === id);
    const list = this.vendorInvitations().map((i) =>
      i.id === id ? { ...i, status: 'revoked' as const } : i,
    );
    this.vendorInvitations.set(list);
    this.saveInvitations(list);

    if (this.sb.client && this.isBrowser && this.isUuid(id)) {
      this.runSupabaseWrite(
        this.sb.client.from('vendor_invitations').update({ status: 'revoked' }).eq('id', id),
      );
    }

    this.logActivity({
      eventType: 'vendor.invitation_revoked',
      category: 'vendor',
      entityType: 'invitation',
      entityId: id,
      entityName: existing?.businessName || id,
      summary: `Revoked vendor invitation for ${existing?.email || id}.`,
    });
  }

  // ============================================================================
  // SUPER ADMIN: PLATFORM SETTINGS, CUSTOMERS & REVIEWS
  // ============================================================================
  updatePlatformSettings(patch: Partial<PlatformSettings>): PlatformSettings {
    const nextFee = Math.max(
      0,
      Number(patch.vendorOnboardingFee ?? this.platformSettings().vendorOnboardingFee ?? 25000),
    );
    const next: PlatformSettings = {
      ...this.platformSettings(),
      ...patch,
      commissionRate: Number(patch.commissionRate ?? this.platformSettings().commissionRate),
      vendorOnboardingFee: nextFee,
    };
    this.platformSettings.set(next);
    this.saveSettings(next);

    // Sync new onboarding fee onto awaiting (unpaid) applications
    if (patch.vendorOnboardingFee !== undefined) {
      const updatedApps = this.vendorApplications().map((a) =>
        a.status === 'pending' || a.status === 'approved'
          ? { ...a, onboardingFee: nextFee }
          : a,
      );
      this.vendorApplications.set(updatedApps);
      this.saveApplications(updatedApps);
    }

    if (this.sb.client && this.isBrowser) {
      void (async () => {
        await this.sb.client!
          .from('platform_settings')
          .update({
            commission_rate: next.commissionRate,
            vendor_onboarding_fee: next.vendorOnboardingFee,
            site_name: next.siteName,
            hero_headline: next.heroHeadline,
            hero_subheadline: next.heroSubheadline,
            announcement_banner: next.announcementBanner,
            support_email: next.supportEmail,
            support_phone: next.supportPhone,
            notify_new_booking: next.notifyNewBooking,
            notify_payment_failed: next.notifyPaymentFailed,
            notify_vendor_application: next.notifyVendorApplication,
            notify_booking_reminders: next.notifyBookingReminders,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);

        if (patch.vendorOnboardingFee !== undefined) {
          await this.sb.client!
            .from('vendor_applications')
            .update({ onboarding_fee: nextFee })
            .in('status', ['pending', 'approved']);
        }
      })();
    }

    this.logActivity({
      eventType: 'settings.updated',
      category: 'settings',
      entityType: 'platform_settings',
      entityId: '1',
      entityName: next.siteName,
      summary: `Updated platform settings (Commission: ${next.commissionRate}%, Onboarding Fee: ${this.formatNaira(next.vendorOnboardingFee)}).`,
    });
    return next;
  }

  setCustomerAccountStatus(profileId: string, status: AccountStatus): void {
    const existing = this.customerAccounts().find((c) => c.id === profileId);
    const list = this.customerAccounts().map((c) =>
      c.id === profileId ? { ...c, status } : c,
    );
    this.customerAccounts.set(list);
    this.saveCustomerAccounts(list);

    if (this.sb.client && this.isBrowser && this.isUuid(profileId)) {
      this.runSupabaseWrite(
        this.sb.client.from('profiles').update({ status }).eq('id', profileId),
      );
    }

    this.logActivity({
      eventType: 'customer.status_changed',
      category: 'customer',
      entityType: 'profile',
      entityId: profileId,
      entityName: existing?.fullName || existing?.email || profileId,
      summary: `Customer account ${existing?.email || profileId} set to ${status}.`,
    });
  }

  setReviewStatus(businessSlug: string, reviewId: string, status: 'published' | 'hidden'): void {
    const biz = this.getBusinessBySlug(businessSlug);
    const list = this.businesses().map((b) => {
      if (b.slug !== businessSlug) return b;
      return {
        ...b,
        reviews: b.reviews.map((r) => (r.id === reviewId ? { ...r, status } : r)),
      };
    });
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(reviewId)) {
      this.runSupabaseWrite(
        this.sb.client.from('reviews').update({ status }).eq('id', reviewId),
      );
    }

    this.logActivity({
      eventType: 'review.moderated',
      category: 'review',
      entityType: 'review',
      entityId: reviewId,
      entityName: biz?.name || businessSlug,
      summary: `Review visibility set to ${status} on ${biz?.name || businessSlug}.`,
    });
  }

  deleteReview(businessSlug: string, reviewId: string): void {
    const biz = this.getBusinessBySlug(businessSlug);
    const list = this.businesses().map((b) => {
      if (b.slug !== businessSlug) return b;
      const reviews = b.reviews.filter((r) => r.id !== reviewId);
      const count = Math.max(0, b.reviewCount - 1);
      const avg =
        reviews.length > 0
          ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
          : 5.0;
      return {
        ...b,
        reviews,
        reviewCount: count,
        rating: avg,
      };
    });
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(reviewId)) {
      this.runSupabaseWrite(
        this.sb.client.from('reviews').delete().eq('id', reviewId),
      );
    }

    this.logActivity({
      eventType: 'review.deleted',
      category: 'review',
      entityType: 'review',
      entityId: reviewId,
      entityName: biz?.name || businessSlug,
      summary: `Deleted review on ${biz?.name || businessSlug}.`,
    });
  }

  // ============================================================================
  // VENDOR ADMIN: CUSTOMER DIRECTORY AGGREGATION & MEDIA UPLOAD
  // ============================================================================
  getVendorCustomers(businessSlug: string): VendorCustomerSummary[] {
    const map = new Map<string, VendorCustomerSummary>();
    for (const bk of this.bookings()) {
      if (bk.businessSlug !== businessSlug) continue;
      const key = bk.customerEmail.toLowerCase();
      const existing = map.get(key) ?? {
        customerName: bk.customerName,
        customerEmail: bk.customerEmail,
        customerPhone: bk.customerPhone,
        totalBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        totalSpent: 0,
        lastVisitDate: bk.dateDisplay,
        bookings: [],
      };

      existing.totalBookings += 1;
      if (bk.status === 'Completed') existing.completedBookings += 1;
      if (bk.status === 'Cancelled') existing.cancelledBookings += 1;
      if (bk.status !== 'Cancelled') existing.totalSpent += bk.amountPaid;
      existing.bookings.push(bk);
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }

  async uploadStudioImage(file: File, folder: string): Promise<string> {
    return this.sb.uploadImage(file, folder);
  }

  slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  formatNaira(amount: number): string {
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  formatDateTime(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }

  logActivity(input: {
    eventType: string;
    category: ActivityCategory;
    actorName?: string;
    actorEmail?: string;
    actorRole?: ActivityLogRecord['actorRole'];
    entityType?: string;
    entityId?: string;
    entityName?: string;
    summary: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): ActivityLogRecord {
    const currentUser = this.auth.currentUser();
    const record: ActivityLogRecord = {
      id: this.generateUuid(),
      eventType: input.eventType,
      category: input.category,
      actorName: input.actorName || currentUser?.fullName || 'System',
      actorEmail: input.actorEmail || currentUser?.email,
      actorRole: input.actorRole || currentUser?.role || 'system',
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      summary: input.summary,
      metadata: input.metadata,
      createdAt: input.createdAt || new Date().toISOString(),
    };

    const next = [record, ...this.activityLogs()].slice(0, 300);
    this.activityLogs.set(next);
    this.saveActivityLogs(next);

    if (this.sb.client && this.isBrowser) {
      void Promise.resolve(
        this.sb.client.from('activity_logs').insert({
          id: record.id,
          event_type: record.eventType,
          category: record.category,
          actor_name: record.actorName,
          actor_email: record.actorEmail || null,
          actor_role: record.actorRole,
          entity_type: record.entityType || null,
          entity_id: record.entityId || null,
          entity_name: record.entityName || null,
          summary: record.summary,
          metadata: record.metadata ?? {},
          created_at: record.createdAt,
        }),
      ).catch(() => {
        // Ignore if activity_logs table has not been migrated yet
      });
    }

    return record;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} mins`;
    const hrs = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0 ? `${hrs} hr${hrs > 1 ? 's' : ''}` : `${hrs}h ${rem}m`;
  }

  private mapBookingRow(b: any): BookingRecord {
    return {
      id: b.id,
      bookingReference: b.booking_reference,
      businessId: b.business_id,
      businessSlug: b.business_slug,
      businessName: b.business_name,
      businessLocation: b.business_location,
      categorySlug: b.category_slug,
      serviceId: b.service_id,
      serviceName: b.service_name,
      servicePrice: Number(b.service_price),
      serviceDurationMinutes: Number(b.service_duration_minutes),
      date: b.date,
      dateDisplay: b.date_display,
      time: b.time,
      staffName: b.staff_name,
      customerId: b.customer_id,
      customerName: b.customer_name,
      customerEmail: b.customer_email,
      customerPhone: b.customer_phone,
      notes: b.notes || undefined,
      paymentOption: b.payment_option,
      amountPaid: Number(b.amount_paid),
      balanceDue: Number(b.balance_due),
      paymentStatus: b.payment_status,
      paystackReference: b.paystack_reference || undefined,
      status: b.status,
      rescheduledFrom: b.rescheduled_from || undefined,
      createdAt: b.created_at,
    };
  }

  private isUuid(val?: string | null): boolean {
    if (!val) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }

  private generateUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private generateNextBookingReference(): string {
    let maxSeq = 0;
    for (const b of this.bookings()) {
      const match = b.bookingReference.match(/BK-\d{4}-(\d+)/i);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (!Number.isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    const next = String(maxSeq + 1).padStart(6, '0');
    return `BK-2026-${next}`;
  }

  private clearLegacySeedStorage(): void {
    if (!this.isBrowser) return;
    try {
      for (const key of LEGACY_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  }

  private loadArrayFromStorage<T>(key: string): T[] {
    if (!this.isBrowser) return [];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as T[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveArrayToStorage<T>(key: string, list: T[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  private loadCategories(): CategoryInfo[] {
    return this.loadArrayFromStorage<CategoryInfo>(CATEGORIES_STORAGE_KEY);
  }

  private saveCategories(list: CategoryInfo[]): void {
    this.saveArrayToStorage(CATEGORIES_STORAGE_KEY, list);
  }

  private loadBusinesses(): BusinessProfile[] {
    return this.loadArrayFromStorage<BusinessProfile>(BUSINESSES_STORAGE_KEY);
  }

  private saveBusinesses(list: BusinessProfile[]): void {
    this.saveArrayToStorage(BUSINESSES_STORAGE_KEY, list);
  }

  private loadBookings(): BookingRecord[] {
    return this.loadArrayFromStorage<BookingRecord>(BOOKINGS_STORAGE_KEY);
  }

  private saveBookings(list: BookingRecord[]): void {
    this.saveArrayToStorage(BOOKINGS_STORAGE_KEY, list);
  }

  private loadTransactions(): TransactionRecord[] {
    return this.loadArrayFromStorage<TransactionRecord>(TRANSACTIONS_STORAGE_KEY);
  }

  private saveTransactions(list: TransactionRecord[]): void {
    this.saveArrayToStorage(TRANSACTIONS_STORAGE_KEY, list);
  }

  private loadInvitations(): VendorInvitation[] {
    return this.loadArrayFromStorage<VendorInvitation>(INVITATIONS_STORAGE_KEY);
  }

  private saveInvitations(list: VendorInvitation[]): void {
    this.saveArrayToStorage(INVITATIONS_STORAGE_KEY, list);
  }

  private loadSettings(): PlatformSettings {
    if (!this.isBrowser) return DEFAULT_PLATFORM_SETTINGS;
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_PLATFORM_SETTINGS;
      return { ...DEFAULT_PLATFORM_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_PLATFORM_SETTINGS;
    }
  }

  private saveSettings(settings: PlatformSettings): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }

  private loadCustomerAccounts(): UserProfile[] {
    return this.loadArrayFromStorage<UserProfile>(CUSTOMERS_STORAGE_KEY);
  }

  private saveCustomerAccounts(list: UserProfile[]): void {
    this.saveArrayToStorage(CUSTOMERS_STORAGE_KEY, list);
  }

  // ==========================================================================
  // VENDOR APPLICATION & ONBOARDING PAYMENT WORKFLOW
  // ==========================================================================
  submitVendorApplication(input: {
    ownerName: string;
    email: string;
    phone: string;
    businessName: string;
    categorySlug: CategorySlug;
    city: string;
    location: string;
    address?: string;
    tagline?: string;
    about?: string;
    instagram?: string;
    coverImage?: string;
    startingServiceName: string;
    startingServicePrice: number;
    startingServiceDurationMinutes?: number;
  }): VendorApplication {
    const cat = this.getCategoryBySlug(input.categorySlug);
    const slug = this.slugify(input.businessName) || `studio-${Date.now()}`;
    const applicationNumber = this.generateNextApplicationNumber();
    const record: VendorApplication = {
      id: `app-${Date.now()}`,
      applicationNumber,
      ownerName: input.ownerName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      businessName: input.businessName.trim(),
      slug,
      categorySlug: input.categorySlug,
      categoryLabel: cat?.name ?? input.categorySlug,
      city: input.city.trim() || 'Lagos',
      location: input.location.trim() || input.city.trim(),
      address: input.address?.trim() || input.location.trim() || input.city.trim(),
      tagline:
        input.tagline?.trim() ||
        `Verified ${cat?.shortName || 'beauty'} studio in ${input.location.trim() || input.city}.`,
      about:
        input.about?.trim() ||
        `${input.businessName.trim()} delivers bespoke ${cat?.shortName?.toLowerCase() || 'beauty'} services in ${input.location.trim() || input.city}.`,
      instagram: input.instagram?.trim() || `@${slug}`,
      coverImage: input.coverImage || cat?.coverImage || 'images/hero-salon.jpg',
      startingServiceName: input.startingServiceName.trim() || 'Signature Session',
      startingServicePrice: Number(input.startingServicePrice) || 20000,
      startingServiceDurationMinutes: Number(input.startingServiceDurationMinutes) || 60,
      onboardingFee: this.platformSettings().vendorOnboardingFee ?? 25000,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const updated = [record, ...this.vendorApplications()];
    this.vendorApplications.set(updated);
    this.saveApplications(updated);

    if (this.isBrowser) {
      void (async () => {
        try {
          const resp = await fetch('/api/public/vendor-applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          });
          if (resp.ok) return;
        } catch {
          // Fallback to direct Supabase insert below
        }

        if (this.sb.client) {
          await this.sb.client.from('vendor_applications').insert({
            application_number: record.applicationNumber,
            owner_name: record.ownerName,
            email: record.email,
            phone: record.phone,
            business_name: record.businessName,
            slug: record.slug,
            category_slug: record.categorySlug,
            category_label: record.categoryLabel,
            city: record.city,
            location: record.location,
            address: record.address,
            tagline: record.tagline,
            about: record.about,
            instagram: record.instagram,
            cover_image: record.coverImage,
            starting_service_name: record.startingServiceName,
            starting_service_price: record.startingServicePrice,
            starting_service_duration_minutes: record.startingServiceDurationMinutes,
            onboarding_fee: record.onboardingFee,
            status: 'pending',
          });
        }
      })();
    }

    this.logActivity({
      eventType: 'application.submitted',
      category: 'application',
      actorName: record.ownerName,
      actorEmail: record.email,
      actorRole: 'vendor',
      entityType: 'vendor_application',
      entityId: record.applicationNumber,
      entityName: record.businessName,
      summary: `Submitted vendor application ${record.applicationNumber} for "${record.businessName}" (${record.location}).`,
      createdAt: record.createdAt,
    });

    return record;
  }

  findApplicationByNumber(appNumber: string): VendorApplication | undefined {
    const normalized = appNumber.trim().toUpperCase();
    if (!normalized) return undefined;
    return this.vendorApplications().find(
      (a) => a.applicationNumber.toUpperCase() === normalized,
    );
  }

  async lookupApplicationRemote(appNumber: string): Promise<VendorApplication | undefined> {
    const local = this.findApplicationByNumber(appNumber);
    if (!this.isBrowser) return local;
    const normalized = appNumber.trim().toUpperCase();
    if (!normalized) return local;
    try {
      const resp = await fetch(
        `/api/public/vendor-application/${encodeURIComponent(normalized)}`,
      );
      if (resp.ok) {
        const json = (await resp.json()) as { application?: any };
        if (json.application) {
          const mapped = this.mapApplicationRow(json.application);
          const merged = [
            mapped,
            ...this.vendorApplications().filter(
              (a) => a.applicationNumber.toUpperCase() !== mapped.applicationNumber.toUpperCase(),
            ),
          ];
          this.vendorApplications.set(merged);
          this.saveApplications(merged);
          return mapped;
        }
      }
    } catch {
      // Fallback to local
    }
    return local;
  }

  async reviewVendorApplication(
    appNumber: string,
    decision: 'approved' | 'declined',
    adminNote?: string,
  ): Promise<{ ok: boolean; application?: VendorApplication; error?: string }> {
    const normalized = appNumber.trim().toUpperCase();
    const existing = this.findApplicationByNumber(normalized);
    if (!existing) {
      return { ok: false, error: `Application ${normalized} not found.` };
    }

    const reviewedAt = new Date().toISOString();
    const trimmedNote = adminNote?.trim() || undefined;
    let updatedApp: VendorApplication = {
      ...existing,
      status: decision,
      adminNote: trimmedNote,
      reviewedAt,
    };

    if (this.isBrowser && this.sb.client && this.auth.authMode() === 'supabase') {
      const token = this.auth.accessToken();
      let persisted = false;
      let lastError = '';

      if (token) {
        try {
          const resp = await fetch(
            `/api/admin/vendor-applications/${encodeURIComponent(normalized)}/review`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ decision, adminNote: trimmedNote }),
            },
          );
          if (resp.ok) {
            const json = (await resp.json()) as { application?: any };
            if (json.application) {
              updatedApp = this.mapApplicationRow(json.application);
            }
            persisted = true;
          } else {
            const errJson = (await resp.json().catch(() => ({}))) as { error?: string };
            lastError = errJson.error || `Server returned ${resp.status}`;
          }
        } catch {
          // Fall back to direct Supabase client update below
        }
      }

      if (!persisted && this.auth.authMode() === 'supabase') {
        const { data, error } = await this.sb.client
          .from('vendor_applications')
          .update({
            status: decision,
            admin_note: trimmedNote ?? null,
            reviewed_at: reviewedAt,
          })
          .ilike('application_number', normalized)
          .select('*')
          .maybeSingle();

        if (!error && data) {
          updatedApp = this.mapApplicationRow(data);
          persisted = true;
        } else {
          lastError = error?.message || lastError || 'Could not update application in Supabase.';
        }
      }

      if (!persisted) {
        return {
          ok: false,
          error:
            lastError ||
            'Sign in with a Supabase Super Admin account at /auth to approve or decline applications.',
        };
      }
    }

    const list = this.vendorApplications().map((a) =>
      a.applicationNumber.toUpperCase() === normalized ? updatedApp : a,
    );
    this.vendorApplications.set(list);
    this.saveApplications(list);

    this.logActivity({
      eventType: `application.${decision}`,
      category: 'application',
      entityType: 'vendor_application',
      entityId: updatedApp.applicationNumber,
      entityName: updatedApp.businessName,
      summary: `${decision === 'approved' ? 'Accepted' : 'Declined'} vendor application ${updatedApp.applicationNumber} (${updatedApp.businessName}).`,
      metadata: trimmedNote ? { adminNote: trimmedNote } : undefined,
      createdAt: reviewedAt,
    });

    return { ok: true, application: updatedApp };
  }

  async completeVendorApplicationPayment(
    appNumber: string,
    paystackReference: string,
  ): Promise<{
    ok: boolean;
    error?: string;
    application?: VendorApplication;
    business?: BusinessProfile;
  }> {
    const app = this.findApplicationByNumber(appNumber);
    if (!app) {
      return { ok: false, error: 'Application number not found.' };
    }
    if (app.status !== 'approved') {
      return {
        ok: false,
        error:
          app.status === 'paid_live'
            ? 'This application has already been paid and activated.'
            : 'This application must be approved by the Super Admin before payment.',
      };
    }

    const tempPassword = this.generateTempPassword();
    const paidAt = new Date().toISOString();

    if (this.isBrowser && this.sb.client) {
      try {
        const resp = await fetch(
          `/api/public/vendor-applications/${encodeURIComponent(app.applicationNumber)}/complete-onboarding`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paystackReference,
              tempPassword,
              email: app.email,
              ownerName: app.ownerName,
              phone: app.phone,
            }),
          },
        );
        const json = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          application?: any;
        };
        if (!resp.ok) {
          return {
            ok: false,
            error: json.error || 'Could not complete onboarding payment on the server.',
          };
        }

        await this.refreshFromBackend();
        const syncedApp = json.application
          ? this.mapApplicationRow(json.application)
          : {
              ...app,
              status: 'paid_live' as const,
              paystackReference,
              paidAt,
              issuedLoginEmail: app.email,
              issuedTempPassword: tempPassword,
              liveBusinessSlug: app.slug,
            };
        const nextApps = this.vendorApplications().map((a) =>
          a.applicationNumber.toUpperCase() === app.applicationNumber.toUpperCase() ? syncedApp : a,
        );
        this.vendorApplications.set(nextApps);
        this.saveApplications(nextApps);

        const syncedBiz = this.getBusinessBySlug(syncedApp.liveBusinessSlug || app.slug);
        if (syncedApp.issuedTempPassword) {
          this.recordVendorCredential({
            businessId: syncedBiz?.id,
            businessSlug: syncedApp.liveBusinessSlug || app.slug,
            email: (syncedApp.issuedLoginEmail || app.email).toLowerCase(),
            tempPassword: syncedApp.issuedTempPassword,
            updatedAt: syncedApp.paidAt || paidAt,
          });
        }
        return { ok: true, application: syncedApp, business: syncedBiz };
      } catch {
        // Fall through to local fallback when server endpoint is unavailable
      }
    }

    const cat = this.getCategoryBySlug(app.categorySlug);
    const words = app.businessName.trim().split(/\s+/);
    const logoText =
      words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : app.businessName.trim().slice(0, 2).toUpperCase();

    const business = this.upsertBusiness({
      slug: app.slug,
      name: app.businessName,
      categorySlug: app.categorySlug,
      categoryLabel: cat?.name ?? app.categoryLabel,
      tagline: app.tagline,
      about: app.about,
      location: app.location,
      city: app.city,
      address: app.address,
      logoText,
      logoBg: '#3b0b0b',
      coverImage: app.coverImage,
      gallery: [],
      featured: false,
      verified: true,
      status: 'active',
      services: [
        {
          id: `srv-${Date.now()}`,
          name: app.startingServiceName,
          categoryLabel: cat?.shortName || 'Signature',
          price: app.startingServicePrice,
          durationMinutes: app.startingServiceDurationMinutes,
          description: `${app.startingServiceName} at ${app.businessName}.`,
          isActive: true,
        },
      ],
      staff: [
        {
          id: `stf-${Date.now()}`,
          name: app.ownerName,
          role: 'Founder & Lead Specialist',
          specialty: cat?.shortName || 'Studio Craft',
          avatarColor: '#b81d1a',
        },
      ],
      workingHours: DEFAULT_WORKING_HOURS,
      contact: {
        phone: app.phone || '+234 800 000 0000',
        email: app.email,
        instagram: app.instagram,
      },
      paymentPolicy: {
        allowFull: true,
        allowDeposit: true,
        depositPercent: 30,
        allowPayAtBusiness: true,
      },
    });

    // Log Paystack onboarding fee transaction
    const tx: TransactionRecord = {
      id: `tx-onb-${Date.now()}`,
      bookingReference: app.applicationNumber,
      businessId: business.id,
      businessName: business.name,
      customerName: app.ownerName,
      customerEmail: app.email,
      gateway: 'Paystack (Vendor Onboarding)',
      gatewayReference: paystackReference,
      amount: app.onboardingFee,
      platformCommissionRate: 100,
      platformCommissionAmount: app.onboardingFee,
      vendorNetAmount: 0,
      status: 'success',
      paidAt,
      createdAt: paidAt,
    };
    const nextTx = [tx, ...this.transactions()];
    this.transactions.set(nextTx);
    this.saveTransactions(nextTx);

    // Provision local vendor login credentials
    this.auth.registerLocalVendorCredentials({
      email: app.email,
      password: tempPassword,
      fullName: app.ownerName,
      phone: app.phone,
      studioSlug: business.slug,
    });

    const updatedApp: VendorApplication = {
      ...app,
      status: 'paid_live',
      paystackReference,
      paidAt,
      issuedLoginEmail: app.email,
      issuedTempPassword: tempPassword,
      liveBusinessSlug: business.slug,
    };

    const nextApps = this.vendorApplications().map((a) =>
      a.applicationNumber.toUpperCase() === app.applicationNumber.toUpperCase() ? updatedApp : a,
    );
    this.vendorApplications.set(nextApps);
    this.saveApplications(nextApps);

    this.recordVendorCredential({
      businessId: business.id,
      businessSlug: business.slug,
      email: app.email.toLowerCase(),
      tempPassword,
      updatedAt: paidAt,
    });

    this.logActivity({
      eventType: 'payment.onboarding_success',
      category: 'transaction',
      actorName: app.ownerName,
      actorEmail: app.email,
      actorRole: 'vendor',
      entityType: 'transaction',
      entityId: paystackReference,
      entityName: business.name,
      summary: `Onboarding fee of ${this.formatNaira(app.onboardingFee)} paid via Paystack (${paystackReference}) for ${business.name} (${app.applicationNumber}).`,
      metadata: { amount: app.onboardingFee, applicationNumber: app.applicationNumber },
      createdAt: paidAt,
    });

    return { ok: true, application: updatedApp, business };
  }

  private generateNextApplicationNumber(): string {
    let maxSeq = 100;
    for (const a of this.vendorApplications()) {
      const m = a.applicationNumber.match(/APP-\d{4}-(\d+)/i);
      if (m) {
        const seq = parseInt(m[1], 10);
        if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return `APP-2026-${String(maxSeq + 1).padStart(6, '0')}`;
  }

  private generateTempPassword(): string {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `Btv!${num}Ng`;
  }

  private mapApplicationRow(r: any): VendorApplication {
    return {
      id: r.id,
      applicationNumber: r.application_number,
      ownerName: r.owner_name,
      email: r.email,
      phone: r.phone || '',
      businessName: r.business_name,
      slug: r.slug,
      categorySlug: r.category_slug,
      categoryLabel: r.category_label,
      city: r.city || 'Lagos',
      location: r.location || '',
      address: r.address || '',
      tagline: r.tagline || '',
      about: r.about || '',
      instagram: r.instagram || '',
      coverImage: r.cover_image || 'images/hero-salon.jpg',
      startingServiceName: r.starting_service_name || 'Signature Session',
      startingServicePrice: Number(r.starting_service_price) || 20000,
      startingServiceDurationMinutes: Number(r.starting_service_duration_minutes) || 60,
      onboardingFee: Number(r.onboarding_fee) || 25000,
      status: (r.status || 'pending') as VendorApplicationStatus,
      adminNote: r.admin_note || undefined,
      paystackReference: r.paystack_reference || undefined,
      paidAt: r.paid_at || undefined,
      issuedLoginEmail: r.issued_login_email || undefined,
      issuedTempPassword: r.issued_temp_password || undefined,
      liveBusinessSlug: r.live_business_slug || undefined,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at || undefined,
    };
  }

  private mapActivityLogRow(r: any): ActivityLogRecord {
    return {
      id: r.id,
      eventType: r.event_type,
      category: (r.category || 'system') as ActivityCategory,
      actorName: r.actor_name || 'System',
      actorEmail: r.actor_email || undefined,
      actorRole: r.actor_role || 'system',
      entityType: r.entity_type || undefined,
      entityId: r.entity_id || undefined,
      entityName: r.entity_name || undefined,
      summary: r.summary,
      metadata: r.metadata || undefined,
      createdAt: r.created_at,
    };
  }

  private loadActivityLogs(): ActivityLogRecord[] {
    return this.loadArrayFromStorage<ActivityLogRecord>(ACTIVITY_LOGS_STORAGE_KEY);
  }

  private saveActivityLogs(list: ActivityLogRecord[]): void {
    this.saveArrayToStorage(ACTIVITY_LOGS_STORAGE_KEY, list);
  }

  getVendorCredential(
    businessSlug: string,
    fallbackEmail?: string,
  ): { email: string; tempPassword: string | null; updatedAt?: string } {
    const slug = (businessSlug || '').trim().toLowerCase();
    const vaultMatch = this.vendorCredentials().find(
      (c) => c.businessSlug.toLowerCase() === slug,
    );
    if (vaultMatch && vaultMatch.tempPassword) {
      return {
        email: vaultMatch.email || fallbackEmail || '',
        tempPassword: vaultMatch.tempPassword,
        updatedAt: vaultMatch.updatedAt,
      };
    }

    const appMatch = this.vendorApplications().find(
      (a) =>
        (a.liveBusinessSlug || a.slug || '').toLowerCase() === slug &&
        Boolean(a.issuedTempPassword),
    );
    if (appMatch?.issuedTempPassword) {
      return {
        email: appMatch.issuedLoginEmail || appMatch.email || fallbackEmail || '',
        tempPassword: appMatch.issuedTempPassword,
        updatedAt: appMatch.paidAt || appMatch.createdAt,
      };
    }

    const localCreds = this.auth.getLocalVendorCredential(slug, fallbackEmail);
    if (localCreds?.password) {
      return {
        email: localCreds.email,
        tempPassword: localCreds.password,
      };
    }

    return {
      email: fallbackEmail || '',
      tempPassword: null,
    };
  }

  async setVendorPassword(
    businessSlug: string,
    email: string,
    newPassword: string,
  ): Promise<{ ok: boolean; error?: string; credential?: VendorCredentialRecord }> {
    const slug = businessSlug.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const password = newPassword.trim();

    if (!slug || !normalizedEmail || password.length < 6) {
      return {
        ok: false,
        error: 'Vendor email and a password of at least 6 characters are required.',
      };
    }

    const biz = this.getBusinessBySlug(slug);
    const token = this.auth.accessToken();

    if (this.isBrowser && this.sb.client && this.auth.authMode() === 'supabase') {
      if (!token) {
        return {
          ok: false,
          error: 'Sign in with a live Supabase Super Admin session to update vendor passwords.',
        };
      }
      try {
        const resp = await fetch('/api/admin/reset-vendor-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            businessSlug: slug,
            email: normalizedEmail,
            newPassword: password,
            fullName: biz?.name,
            phone: biz?.contact?.phone,
          }),
        });
        const json = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          credential?: VendorCredentialRecord;
        };
        if (!resp.ok) {
          return { ok: false, error: json.error || `Server returned ${resp.status}` };
        }

        const cred: VendorCredentialRecord = json.credential || {
          businessId: biz?.id,
          businessSlug: slug,
          email: normalizedEmail,
          tempPassword: password,
          updatedAt: new Date().toISOString(),
        };
        this.recordVendorCredential(cred);
        this.syncApplicationCredential(slug, normalizedEmail, password);
        return { ok: true, credential: cred };
      } catch {
        return { ok: false, error: 'Unable to reach SSR server to reset vendor Auth password.' };
      }
    }

    const cred: VendorCredentialRecord = {
      businessId: biz?.id,
      businessSlug: slug,
      email: normalizedEmail,
      tempPassword: password,
      updatedAt: new Date().toISOString(),
    };
    this.auth.registerLocalVendorCredentials({
      email: normalizedEmail,
      password,
      fullName: biz?.name || normalizedEmail.split('@')[0],
      phone: biz?.contact?.phone || '',
      studioSlug: slug,
    });
    this.recordVendorCredential(cred);
    this.syncApplicationCredential(slug, normalizedEmail, password);
    this.logActivity({
      eventType: 'vendor.password_updated',
      category: 'vendor',
      entityType: 'business',
      entityId: slug,
      entityName: biz?.name || slug,
      summary: `Set/reset vendor login password for "${biz?.name || slug}" (${normalizedEmail}).`,
    });
    return { ok: true, credential: cred };
  }

  private recordVendorCredential(cred: VendorCredentialRecord): void {
    const slug = cred.businessSlug.trim().toLowerCase();
    const normalized: VendorCredentialRecord = {
      ...cred,
      businessSlug: slug,
      email: cred.email.trim().toLowerCase(),
      updatedAt: cred.updatedAt || new Date().toISOString(),
    };
    const next = [
      normalized,
      ...this.vendorCredentials().filter((c) => c.businessSlug.toLowerCase() !== slug),
    ];
    this.vendorCredentials.set(next);
    this.saveVendorCredentials(next);
  }

  private syncApplicationCredential(slug: string, email: string, tempPassword: string): void {
    const nextApps = this.vendorApplications().map((a) =>
      (a.liveBusinessSlug || a.slug || '').toLowerCase() === slug
        ? { ...a, issuedLoginEmail: email, issuedTempPassword: tempPassword }
        : a,
    );
    this.vendorApplications.set(nextApps);
    this.saveApplications(nextApps);
  }

  private loadApplications(): VendorApplication[] {
    return this.loadArrayFromStorage<VendorApplication>(APPLICATIONS_STORAGE_KEY);
  }

  private saveApplications(list: VendorApplication[]): void {
    this.saveArrayToStorage(APPLICATIONS_STORAGE_KEY, list);
  }

  private loadVendorCredentials(): VendorCredentialRecord[] {
    return this.loadArrayFromStorage<VendorCredentialRecord>(VENDOR_CREDS_STORAGE_KEY);
  }

  private saveVendorCredentials(list: VendorCredentialRecord[]): void {
    this.saveArrayToStorage(VENDOR_CREDS_STORAGE_KEY, list);
  }
}
