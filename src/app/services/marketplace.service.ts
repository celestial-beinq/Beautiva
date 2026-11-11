import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import {
  DEFAULT_WORKING_HOURS,
  SEED_BOOKINGS,
  SEED_BUSINESSES,
  SEED_CATEGORIES,
} from '../data/seed-data';
import {
  AccountStatus,
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
  VendorInvitation,
  WorkingHours,
} from '../models/marketplace.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const BUSINESSES_STORAGE_KEY = 'beautiva_businesses_v1';
const BOOKINGS_STORAGE_KEY = 'beautiva_bookings_v1';
const CATEGORIES_STORAGE_KEY = 'beautiva_categories_v1';
const TRANSACTIONS_STORAGE_KEY = 'beautiva_transactions_v1';
const INVITATIONS_STORAGE_KEY = 'beautiva_invitations_v1';
const SETTINGS_STORAGE_KEY = 'beautiva_settings_v1';
const CUSTOMERS_STORAGE_KEY = 'beautiva_customers_v1';

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

      if (catRes.data && catRes.data.length > 0) {
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

      if (bizRes.data && bizRes.data.length > 0) {
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
        const [bkRes, txRes, invRes, profRes] = await Promise.all([
          this.sb.client.from('bookings').select('*').order('created_at', { ascending: false }),
          this.sb.client.from('transactions').select('*').order('created_at', { ascending: false }),
          this.sb.client
            .from('vendor_invitations')
            .select('*')
            .order('created_at', { ascending: false }),
          this.sb.client.from('profiles').select('*').order('created_at', { ascending: false }),
        ]);

        if (bkRes.data && bkRes.data.length > 0) {
          const mappedBookings = bkRes.data.map((b: any) => this.mapBookingRow(b));
          this.bookings.set(mappedBookings);
          this.saveBookings(mappedBookings);
        }

        if (txRes.data && txRes.data.length > 0) {
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
      createdAt: new Date().toISOString(),
    };
    const updated = [tx, ...this.transactions()];
    this.transactions.set(updated);
    this.saveTransactions(updated);

    if (this.sb.client && this.isBrowser && biz && this.isUuid(biz.id)) {
      void this.sb.client.from('transactions').insert({
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
      });
    }
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
    const updated = this.bookings().map((b) => {
      if (b.bookingReference.toUpperCase() !== reference.trim().toUpperCase()) {
        return b;
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
        void this.sb.client
          .from('bookings')
          .update({
            status: target.status,
            payment_status: target.paymentStatus,
            amount_paid: target.amountPaid,
            balance_due: target.balanceDue,
          })
          .ilike('booking_reference', target.bookingReference);
      }
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
        void this.sb.client
          .from('bookings')
          .update({
            date: target.date,
            date_display: target.dateDisplay,
            time: target.time,
            status: target.status,
            rescheduled_from: target.rescheduledFrom,
          })
          .ilike('booking_reference', target.bookingReference);
      }
    }
    return target;
  }

  addReview(businessSlug: string, review: Omit<BusinessReview, 'id' | 'dateLabel'>): void {
    let targetBizId: string | undefined;
    const reviewId = `rev-${Date.now()}`;
    const updated = this.businesses().map((biz) => {
      if (biz.slug !== businessSlug) return biz;
      targetBizId = biz.id;
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
      void this.sb.client.from('reviews').insert({
        business_id: targetBizId,
        business_slug: businessSlug,
        author: review.author,
        rating: review.rating,
        service_name: review.serviceName,
        date_label: 'Just now',
        comment: review.comment,
        status: 'published',
      });
    }
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
    let updatedBiz: BusinessProfile | undefined;
    const category = patch.categorySlug ? this.getCategoryBySlug(patch.categorySlug) : undefined;

    const list = this.businesses().map((b) => {
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

      if (this.sb.client && this.isBrowser && this.isUuid(updatedBiz.id)) {
        const biz = updatedBiz;
        void (async () => {
          await this.sb.client!.from('businesses').update({
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
          }).eq('id', biz.id);

          if (patch.services) {
            await this.syncBusinessServicesToSupabase(biz.id, biz.services);
          }
          if (patch.staff) {
            await this.syncBusinessStaffToSupabase(biz.id, biz.staff);
          }
        })();
      }
    }
    return updatedBiz;
  }

  setBusinessStatus(slug: string, status: StudioStatus): void {
    const existing = this.getBusinessBySlug(slug);
    const list = this.businesses().map((b) =>
      b.slug === slug
        ? { ...b, status, verified: status === 'active' ? true : b.verified }
        : b,
    );
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && existing && this.isUuid(existing.id)) {
      void this.sb.client
        .from('businesses')
        .update({ status, verified: status === 'active' ? true : existing.verified })
        .eq('id', existing.id);
    }
  }

  deleteBusiness(slug: string): void {
    const existing = this.getBusinessBySlug(slug);
    const list = this.businesses().filter((b) => b.slug !== slug);
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && existing && this.isUuid(existing.id)) {
      void this.sb.client.from('businesses').delete().eq('id', existing.id);
    }
  }

  toggleBusinessVerified(slug: string): void {
    let nextVal = true;
    let bizId = '';
    const list = this.businesses().map((b) => {
      if (b.slug !== slug) return b;
      nextVal = !b.verified;
      bizId = b.id;
      return { ...b, verified: nextVal };
    });
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(bizId)) {
      void this.sb.client.from('businesses').update({ verified: nextVal }).eq('id', bizId);
    }
  }

  toggleBusinessFeatured(slug: string): void {
    let nextVal = true;
    let bizId = '';
    const list = this.businesses().map((b) => {
      if (b.slug !== slug) return b;
      nextVal = !b.featured;
      bizId = b.id;
      return { ...b, featured: nextVal };
    });
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(bizId)) {
      void this.sb.client.from('businesses').update({ featured: nextVal }).eq('id', bizId);
    }
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
      void this.sb.client.from('categories').upsert(
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
      );
    }
    return record;
  }

  deleteCategory(slug: string): void {
    const list = this.categories().filter((c) => c.slug !== slug);
    this.categories.set(list);
    this.saveCategories(list);

    if (this.sb.client && this.isBrowser) {
      void this.sb.client.from('categories').delete().eq('slug', slug);
    }
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
            email: input.email,
            password: input.password,
            fullName: input.fullName,
            phone: input.phone,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          ownerId = data.userId;
          authProvisioned = true;
          message = `Vendor login (${input.email.toLowerCase()}) & studio "${input.businessName}" created. The vendor can now sign in at /auth.`;
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
        email: input.email,
        businessName: input.businessName,
        categorySlug: input.categorySlug,
        city: input.city,
      });
    }

    const cat = this.getCategoryBySlug(input.categorySlug);
    const slug = this.slugify(input.businessName) || `studio-${Date.now()}`;
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
      gallery: [cat?.coverImage || 'images/hero-salon.jpg'],
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
      void this.sb.client.from('vendor_invitations').insert({
        id: invite.id,
        email: invite.email,
        business_name: invite.businessName,
        category_slug: invite.categorySlug,
        city: invite.city,
        invite_token: invite.inviteToken,
        status: invite.status,
      });
    }
    return invite;
  }

  revokeInvitation(id: string): void {
    const list = this.vendorInvitations().map((i) =>
      i.id === id ? { ...i, status: 'revoked' as const } : i,
    );
    this.vendorInvitations.set(list);
    this.saveInvitations(list);

    if (this.sb.client && this.isBrowser && this.isUuid(id)) {
      void this.sb.client.from('vendor_invitations').update({ status: 'revoked' }).eq('id', id);
    }
  }

  // ============================================================================
  // SUPER ADMIN: PLATFORM SETTINGS, CUSTOMERS & REVIEWS
  // ============================================================================
  updatePlatformSettings(patch: Partial<PlatformSettings>): PlatformSettings {
    const next: PlatformSettings = {
      ...this.platformSettings(),
      ...patch,
      commissionRate: Number(patch.commissionRate ?? this.platformSettings().commissionRate),
    };
    this.platformSettings.set(next);
    this.saveSettings(next);

    if (this.sb.client && this.isBrowser) {
      void this.sb.client
        .from('platform_settings')
        .update({
          commission_rate: next.commissionRate,
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
    }
    return next;
  }

  setCustomerAccountStatus(profileId: string, status: AccountStatus): void {
    const list = this.customerAccounts().map((c) =>
      c.id === profileId ? { ...c, status } : c,
    );
    this.customerAccounts.set(list);
    this.saveCustomerAccounts(list);

    if (this.sb.client && this.isBrowser && this.isUuid(profileId)) {
      void this.sb.client.from('profiles').update({ status }).eq('id', profileId);
    }
  }

  setReviewStatus(businessSlug: string, reviewId: string, status: 'published' | 'hidden'): void {
    const list = this.businesses().map((biz) => {
      if (biz.slug !== businessSlug) return biz;
      return {
        ...biz,
        reviews: biz.reviews.map((r) => (r.id === reviewId ? { ...r, status } : r)),
      };
    });
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(reviewId)) {
      void this.sb.client.from('reviews').update({ status }).eq('id', reviewId);
    }
  }

  deleteReview(businessSlug: string, reviewId: string): void {
    const list = this.businesses().map((biz) => {
      if (biz.slug !== businessSlug) return biz;
      const reviews = biz.reviews.filter((r) => r.id !== reviewId);
      const count = Math.max(0, biz.reviewCount - 1);
      const avg =
        reviews.length > 0
          ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
          : 5.0;
      return {
        ...biz,
        reviews,
        reviewCount: count,
        rating: avg,
      };
    });
    this.businesses.set(list);
    this.saveBusinesses(list);

    if (this.sb.client && this.isBrowser && this.isUuid(reviewId)) {
      void this.sb.client.from('reviews').delete().eq('id', reviewId);
    }
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
    let maxSeq = 124;
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

  private loadCategories(): CategoryInfo[] {
    if (!this.isBrowser) return SEED_CATEGORIES;
    try {
      const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (!raw) return SEED_CATEGORIES;
      const parsed = JSON.parse(raw) as CategoryInfo[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_CATEGORIES;
    } catch {
      return SEED_CATEGORIES;
    }
  }

  private saveCategories(list: CategoryInfo[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  private loadBusinesses(): BusinessProfile[] {
    if (!this.isBrowser) return SEED_BUSINESSES;
    try {
      const raw = localStorage.getItem(BUSINESSES_STORAGE_KEY);
      if (!raw) return SEED_BUSINESSES;
      const parsed = JSON.parse(raw) as BusinessProfile[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_BUSINESSES;
    } catch {
      return SEED_BUSINESSES;
    }
  }

  private saveBusinesses(list: BusinessProfile[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(BUSINESSES_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  private loadBookings(): BookingRecord[] {
    if (!this.isBrowser) return SEED_BOOKINGS;
    try {
      const raw = localStorage.getItem(BOOKINGS_STORAGE_KEY);
      if (!raw) return SEED_BOOKINGS;
      const parsed = JSON.parse(raw) as BookingRecord[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_BOOKINGS;
    } catch {
      return SEED_BOOKINGS;
    }
  }

  private saveBookings(list: BookingRecord[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  private loadTransactions(): TransactionRecord[] {
    const seedTx: TransactionRecord[] = SEED_BOOKINGS.filter((b) => b.amountPaid > 0).map(
      (b, idx) => ({
        id: `tx-seed-${idx + 1}`,
        bookingReference: b.bookingReference,
        businessName: b.businessName,
        customerName: b.customerName,
        customerEmail: b.customerEmail,
        gateway: 'Paystack',
        gatewayReference: b.paystackReference || `PSK_SEED_${idx + 1}`,
        amount: b.amountPaid,
        platformCommissionRate: 10,
        platformCommissionAmount: Math.round(b.amountPaid * 0.1),
        vendorNetAmount: b.amountPaid - Math.round(b.amountPaid * 0.1),
        status: 'success',
        paidAt: b.createdAt,
        createdAt: b.createdAt,
      }),
    );
    seedTx.push({
      id: 'tx-seed-fail-1',
      bookingReference: 'BK-2026-000119',
      businessName: 'Velvet Crown Atelier',
      customerName: 'Teniola Adewale',
      customerEmail: 'teniola.a@example.com',
      gateway: 'Paystack',
      gatewayReference: 'PSK_FAIL_000119',
      amount: 45000,
      platformCommissionRate: 10,
      platformCommissionAmount: 0,
      vendorNetAmount: 0,
      status: 'failed',
      failureReason: 'Insufficient funds / 3DS timeout',
      createdAt: '2026-11-08T15:10:00.000Z',
    });

    if (!this.isBrowser) return seedTx;
    try {
      const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
      if (!raw) return seedTx;
      const parsed = JSON.parse(raw) as TransactionRecord[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedTx;
    } catch {
      return seedTx;
    }
  }

  private saveTransactions(list: TransactionRecord[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  private loadInvitations(): VendorInvitation[] {
    const seedInv: VendorInvitation[] = [
      {
        id: 'inv-seed-1',
        email: 'founder@solaceglow.ng',
        businessName: 'Solace Glow Collective',
        categorySlug: 'lash-technicians',
        city: 'Lagos',
        inviteToken: 'inv-beautiva-solace-2026',
        status: 'pending',
        createdAt: '2026-11-10T10:00:00.000Z',
        expiresAt: '2026-11-24T10:00:00.000Z',
      },
    ];
    if (!this.isBrowser) return seedInv;
    try {
      const raw = localStorage.getItem(INVITATIONS_STORAGE_KEY);
      if (!raw) return seedInv;
      const parsed = JSON.parse(raw) as VendorInvitation[];
      return Array.isArray(parsed) ? parsed : seedInv;
    } catch {
      return seedInv;
    }
  }

  private saveInvitations(list: VendorInvitation[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(INVITATIONS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
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
    const derived: UserProfile[] = SEED_BOOKINGS.map((b, idx) => ({
      id: `cust-seed-${idx + 1}`,
      email: b.customerEmail,
      fullName: b.customerName,
      phone: b.customerPhone,
      role: 'customer',
      status: 'active',
      createdAt: b.createdAt,
    }));
    if (!this.isBrowser) return derived;
    try {
      const raw = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
      if (!raw) return derived;
      const parsed = JSON.parse(raw) as UserProfile[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : derived;
    } catch {
      return derived;
    }
  }

  private saveCustomerAccounts(list: UserProfile[]): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }
}
