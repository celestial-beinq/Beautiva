import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_WORKING_HOURS,
  SEED_BOOKINGS,
  SEED_BUSINESSES,
  SEED_CATEGORIES,
} from '../data/seed-data';
import {
  BookingRecord,
  BookingStatus,
  BusinessProfile,
  BusinessReview,
  CategoryInfo,
  CategorySlug,
  PaymentOption,
  PaymentStatus,
  PopularServiceHighlight,
} from '../models/marketplace.models';

const BUSINESSES_STORAGE_KEY = 'beautiva_businesses_v1';
const BOOKINGS_STORAGE_KEY = 'beautiva_bookings_v1';

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

@Injectable({
  providedIn: 'root',
})
export class MarketplaceService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly categories = signal<CategoryInfo[]>(SEED_CATEGORIES);
  readonly businesses = signal<BusinessProfile[]>(this.loadBusinesses());
  readonly bookings = signal<BookingRecord[]>(this.loadBookings());

  readonly featuredBusinesses = computed(() =>
    this.businesses().filter((b) => b.featured).slice(0, 6),
  );

  readonly popularServices = computed<PopularServiceHighlight[]>(() => {
    const list: PopularServiceHighlight[] = [];
    for (const biz of this.businesses()) {
      if (biz.services.length > 0) {
        list.push({
          businessSlug: biz.slug,
          businessName: biz.name,
          businessLocation: biz.location,
          categorySlug: biz.categorySlug,
          service: biz.services[0],
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

  getCategoryBySlug(slug: string | null | undefined): CategoryInfo | undefined {
    if (!slug) return undefined;
    return this.categories().find((c) => c.slug === slug);
  }

  getBusinessesByCategory(slug: CategorySlug): BusinessProfile[] {
    return this.businesses().filter((b) => b.categorySlug === slug);
  }

  getBusinessBySlug(slug: string | null | undefined): BusinessProfile | undefined {
    if (!slug) return undefined;
    return this.businesses().find((b) => b.slug.toLowerCase() === slug.toLowerCase());
  }

  getStartingPrice(business: BusinessProfile): number {
    if (!business.services.length) return 0;
    return Math.min(...business.services.map((s) => s.price));
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
    return this.businesses().filter((biz) => {
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
      const inServices = biz.services.some((s) => s.name.toLowerCase().includes(q));
      return inName || inLoc || inCat || inServices;
    });
  }

  getBookedSlots(businessSlug: string, date: string): string[] {
    return this.bookings()
      .filter(
        (b) =>
          b.businessSlug === businessSlug && b.date === date && b.status !== 'Cancelled',
      )
      .map((b) => b.time);
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
    const record: BookingRecord = {
      bookingReference,
      businessSlug: biz.slug,
      businessName: biz.name,
      businessLocation: biz.location,
      serviceId: service.id,
      serviceName: service.name,
      servicePrice: service.price,
      serviceDurationMinutes: service.durationMinutes,
      date: input.date,
      dateDisplay: input.dateDisplay,
      time: input.time,
      staffName: input.staffName || 'Any available specialist',
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
      createdAt: new Date().toISOString(),
    };

    const updated = [record, ...this.bookings()];
    this.bookings.set(updated);
    this.saveBookings(updated);
    return record;
  }

  findBookingByReference(reference: string): BookingRecord | undefined {
    const normalized = reference.trim().toUpperCase();
    if (!normalized) return undefined;
    return this.bookings().find(
      (b) => b.bookingReference.toUpperCase() === normalized,
    );
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
    }
    return target;
  }

  addReview(
    businessSlug: string,
    review: Omit<BusinessReview, 'id' | 'dateLabel'>,
  ): void {
    const updated = this.businesses().map((biz) => {
      if (biz.slug !== businessSlug) return biz;
      const newRev: BusinessReview = {
        ...review,
        id: `rev-${Date.now()}`,
        dateLabel: 'Just now',
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
  }

  upsertBusiness(
    input: Omit<BusinessProfile, 'id' | 'rating' | 'reviewCount' | 'reviews' | 'verified'> & {
      id?: string;
    },
  ): BusinessProfile {
    const existing = this.getBusinessBySlug(input.slug);
    const category = this.getCategoryBySlug(input.categorySlug);

    const record: BusinessProfile = {
      ...input,
      id: existing?.id ?? input.id ?? `biz-${Date.now()}`,
      categoryLabel: category?.name ?? input.categoryLabel,
      workingHours: input.workingHours?.length ? input.workingHours : DEFAULT_WORKING_HOURS,
      rating: existing?.rating ?? 5.0,
      reviewCount: existing?.reviewCount ?? 1,
      verified: true,
      reviews: existing?.reviews ?? [
        {
          id: `rev-init-${Date.now()}`,
          author: 'Beautiva Concierge',
          rating: 5,
          serviceName: input.services[0]?.name || 'Signature Session',
          dateLabel: 'New studio',
          comment: 'Verified studio profile automatically generated on Beautiva.',
        },
      ],
    };

    const list = existing
      ? this.businesses().map((b) => (b.slug === existing.slug ? record : b))
      : [record, ...this.businesses()];

    this.businesses.set(list);
    this.saveBusinesses(list);
    return record;
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
      // Ignore storage quota errors in demo mode
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
      // Ignore storage quota errors in demo mode
    }
  }
}

