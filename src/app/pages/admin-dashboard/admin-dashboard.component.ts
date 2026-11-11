import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AccountStatus,
  ActivityCategory,
  BusinessProfile,
  CategoryInfo,
  CategorySlug,
  PlatformSettings,
  StudioStatus,
  VendorApplication,
  VendorApplicationStatus,
} from '../../models/marketplace.models';
import { AuthService } from '../../services/auth.service';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent {
  readonly marketplace = inject(MarketplaceService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  async logout(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigate(['/auth']);
  }

  readonly categories = this.marketplace.categories;
  readonly businesses = this.marketplace.businesses;
  readonly bookings = this.marketplace.bookings;
  readonly transactions = this.marketplace.transactions;
  readonly invitations = this.marketplace.vendorInvitations;
  readonly vendorApplications = this.marketplace.vendorApplications;
  readonly activityLogs = this.marketplace.activityLogs;

  // Live analytics & chart state
  readonly analyticsPeriod = signal<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  readonly customStartDate = signal<string>(this.offsetDateKey(-6));
  readonly customEndDate = signal<string>(this.offsetDateKey(0));
  readonly chartMetric = signal<'revenue' | 'activity'>('revenue');
  readonly donutMode = signal<'payments' | 'bookings'>('payments');
  readonly liveAutoRefresh = signal(true);
  readonly isSyncing = signal(false);
  readonly lastSyncedAt = signal(new Date());
  readonly hoveredDayIndex = signal<number | null>(null);

  readonly activeTab = signal<
    'overview' | 'vendors' | 'categories' | 'payments' | 'settings' | 'logs'
  >('overview');
  readonly toast = signal('');

  // Vendor Applications review state
  readonly applicationFilter = signal<'all' | 'pending' | 'approved' | 'declined'>('all');
  readonly viewingApplicationNum = signal<string | null>(null);
  readonly reviewingAppNum = signal<string | null>(null);
  private readonly dismissedOnboardingsKey = 'beautiva_dismissed_completed_onboardings_v1';
  readonly dismissedOnboardingNumbers = signal<string[]>(this.loadDismissedOnboardings());
  applicationReviewNote = '';

  // Vendor Management filters & forms
  readonly studioSearch = signal('');
  readonly studioCategoryFilter = signal<CategorySlug | 'all'>('all');
  readonly studioStatusFilter = signal<'all' | StudioStatus>('all');
  readonly showCreateVendor = signal(false);
  readonly showInviteVendor = signal(false);
  readonly editingVendorSlug = signal<string | null>(null);
  readonly editingVendor = computed(() => {
    const slug = this.editingVendorSlug();
    return slug ? (this.marketplace.getBusinessBySlug(slug) ?? null) : null;
  });
  readonly settingPasswordSlug = signal<string | null>(null);
  readonly revealedPasswordSlugs = signal<Set<string>>(new Set());
  readonly busyStudioSlug = signal<string | null>(null);
  readonly viewingApplication = signal<BusinessProfile | null>(null);

  passwordResetForm = {
    email: '',
    newPassword: '',
  };

  newVendor = {
    fullName: '',
    email: '',
    password: '',
    phone: '',
    businessName: '',
    categorySlug: 'hairdressers' as CategorySlug,
    city: 'Lagos',
    location: '',
  };

  inviteForm = {
    email: '',
    businessName: '',
    categorySlug: 'hairdressers' as CategorySlug,
    city: 'Lagos',
  };

  editVendorForm = {
    name: '',
    categorySlug: 'hairdressers' as CategorySlug,
    city: '',
    location: '',
    address: '',
    phone: '',
    email: '',
    tagline: '',
  };

  // Category Management form
  readonly editingCategorySlug = signal<string | null>(null);
  categoryForm: {
    slug: string;
    name: string;
    shortName: string;
    tagline: string;
    description: string;
    coverImage: string;
    tagsText: string;
  } = {
    slug: '',
    name: '',
    shortName: '',
    tagline: '',
    description: '',
    coverImage: 'images/cat-hairdressers.jpg',
    tagsText: '',
  };

  // Payment Management filters
  readonly paymentFilter = signal<'all' | 'success' | 'failed' | 'refunded'>('all');
  readonly paymentSearch = signal('');

  // Activity Log filters
  readonly logCategoryFilter = signal<'all' | ActivityCategory>('all');
  readonly logSearch = signal('');

  // Platform Settings & Customer Accounts
  readonly customerSearch = signal('');
  settingsDraft: PlatformSettings = { ...this.marketplace.platformSettings() };
  onboardingFeeInput: number = this.marketplace.platformSettings().vendorOnboardingFee;

  constructor() {
    effect(() => {
      const s = this.marketplace.platformSettings();
      this.settingsDraft = { ...s };
      this.onboardingFeeInput = s.vendorOnboardingFee;
    });

    if (isPlatformBrowser(this.platformId)) {
      const timer = setInterval(() => {
        if (this.liveAutoRefresh() && !this.isSyncing()) {
          void this.syncLiveAnalytics(true);
        }
      }, 15000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    }
  }

  async syncLiveAnalytics(silent = false): Promise<void> {
    if (this.isSyncing()) return;
    this.isSyncing.set(true);
    try {
      if (this.marketplace.supabaseConfigured) {
        await this.marketplace.refreshFromBackend();
      }
      this.lastSyncedAt.set(new Date());
      if (!silent) {
        this.flash('Live analytics synced.');
      }
    } finally {
      this.isSyncing.set(false);
    }
  }

  readonly lastSyncedLabel = computed(() =>
    this.lastSyncedAt().toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  readonly uniqueCustomers = computed(() => {
    return this.marketplace
      .customerAccounts()
      .filter((acc) => acc.role === 'customer')
      .map((acc) => ({
        id: acc.id,
        fullName: acc.fullName,
        email: acc.email,
        phone: acc.phone,
        status: acc.status,
      }));
  });

  readonly filteredCustomers = computed(() => {
    const q = this.customerSearch().trim().toLowerCase();
    return this.uniqueCustomers().filter(
      (c) =>
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    );
  });

  readonly platformMetrics = computed(() => {
    const allBiz = this.businesses();
    const activeStudios = allBiz.filter((b) => (b.status ?? 'active') === 'active').length;
    const pendingStudios = allBiz.filter((b) => b.status === 'pending').length;
    const suspendedStudios = allBiz.filter((b) => b.status === 'suspended').length;
    const verifiedStudios = allBiz.filter((b) => b.verified).length;
    const featuredStudios = allBiz.filter((b) => b.featured).length;

    const rate = this.marketplace.platformSettings().commissionRate || 10;
    const txs = this.transactions();
    const successTx = txs.filter((t) => t.status === 'success');
    const failedTx = txs.filter((t) => t.status === 'failed');
    const successTxVolume = successTx.reduce((s, t) => s + t.amount, 0);
    const platformCommission = successTx.reduce(
      (s, t) => s + (t.platformCommissionAmount || Math.round((t.amount * rate) / 100)),
      0,
    );

    return {
      totalStudios: allBiz.length,
      activeStudios,
      pendingStudios,
      suspendedStudios,
      verifiedStudios,
      featuredStudios,
      totalCustomers: this.uniqueCustomers().length,
      platformCommission,
      commissionRate: rate,
      successTxCount: successTx.length,
      successTxVolume,
      failedTxCount: failedTx.length,
      failedTxVolume: failedTx.reduce((s, t) => s + t.amount, 0),
    };
  });

  readonly categoryBreakdown = computed(() => {
    const rows = this.categories().map((cat) => {
      const studios = this.businesses().filter((b) => b.categorySlug === cat.slug);
      const activeCount = studios.filter((b) => (b.status ?? 'active') === 'active').length;
      return {
        slug: cat.slug,
        name: cat.shortName,
        studioCount: studios.length,
        activeCount,
      };
    });

    const maxCount = Math.max(1, ...rows.map((r) => r.studioCount));
    return rows
      .map((r) => ({
        ...r,
        barWidthPct: Math.max(r.studioCount > 0 ? 15 : 0, Math.round((r.studioCount / maxCount) * 100)),
      }))
      .sort((a, b) => b.studioCount - a.studioCount);
  });

  setAnalyticsPeriod(period: 'daily' | 'weekly' | 'monthly' | 'custom'): void {
    this.analyticsPeriod.set(period);
    this.hoveredDayIndex.set(null);
  }

  private offsetDateKey(daysDelta: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + daysDelta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private parseLocalDate(key: string | undefined): Date | null {
    if (!key) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  readonly liveChart = computed(() => {
    const period = this.analyticsPeriod();
    const metric = this.chartMetric();
    const rate = this.marketplace.platformSettings().commissionRate || 10;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate = new Date(today);
    let endDate = new Date(today);
    let periodLabel = '7-Day';
    let rangeDescription = 'the last 7 days';

    if (period === 'daily') {
      periodLabel = 'Today';
      rangeDescription = `today (${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, hourly)`;
    } else if (period === 'weekly') {
      startDate.setDate(today.getDate() - 6);
      periodLabel = '7-Day';
      rangeDescription = 'the last 7 days';
    } else if (period === 'monthly') {
      startDate.setDate(today.getDate() - 29);
      periodLabel = '30-Day';
      rangeDescription = 'the last 30 days';
    } else {
      const parsedStart = this.parseLocalDate(this.customStartDate()) ?? new Date(today);
      const parsedEnd = this.parseLocalDate(this.customEndDate()) ?? new Date(today);
      if (parsedStart.getTime() <= parsedEnd.getTime()) {
        startDate = parsedStart;
        endDate = parsedEnd;
      } else {
        startDate = parsedEnd;
        endDate = parsedStart;
      }
      const startFmt = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endFmt = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      periodLabel = 'Custom';
      rangeDescription =
        startDate.getTime() === endDate.getTime()
          ? `${endFmt} (hourly)`
          : `${startFmt} – ${endFmt}`;
    }

    const msPerDay = 86_400_000;
    const spanDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1);
    const isHourly = spanDays === 1;
    const isWeeklyGrouped = spanDays > 62;

    interface BucketEntry {
      dateKey: string;
      shortLabel: string;
      fullLabel: string;
      grossVolume: number;
      commission: number;
      txCount: number;
      allTxCount: number;
      bookingsCount: number;
      onboardingCount: number;
    }

    const buckets = new Map<string, BucketEntry>();
    const orderedKeys: string[] = [];

    if (isHourly) {
      const dayKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      for (let h = 0; h < 24; h++) {
        const key = `${dayKey}T${String(h).padStart(2, '0')}`;
        const label = `${String(h).padStart(2, '0')}:00`;
        orderedKeys.push(key);
        buckets.set(key, {
          dateKey: key,
          shortLabel: label,
          fullLabel: `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${label}`,
          grossVolume: 0,
          commission: 0,
          txCount: 0,
          allTxCount: 0,
          bookingsCount: 0,
          onboardingCount: 0,
        });
      }
    } else if (isWeeklyGrouped) {
      for (let offset = 0; offset < spanDays; offset += 7) {
        const wStart = new Date(startDate);
        wStart.setDate(startDate.getDate() + offset);
        const wEnd = new Date(startDate);
        wEnd.setDate(Math.min(startDate.getDate() + spanDays - 1, startDate.getDate() + offset + 6));
        const key = `W-${offset}`;
        const shortLabel = wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const fullLabel = `${shortLabel} – ${wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        orderedKeys.push(key);
        buckets.set(key, {
          dateKey: key,
          shortLabel,
          fullLabel,
          grossVolume: 0,
          commission: 0,
          txCount: 0,
          allTxCount: 0,
          bookingsCount: 0,
          onboardingCount: 0,
        });
      }
    } else {
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        orderedKeys.push(key);
        buckets.set(key, {
          dateKey: key,
          shortLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          grossVolume: 0,
          commission: 0,
          txCount: 0,
          allTxCount: 0,
          bookingsCount: 0,
          onboardingCount: 0,
        });
      }
    }

    const resolveBucket = (rawDate: string | undefined): BucketEntry | undefined => {
      if (!rawDate) return undefined;
      if (isHourly) {
        const targetKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          return rawDate === targetKey ? buckets.get(`${targetKey}T09`) : undefined;
        }
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) return undefined;
        const dKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        if (dKey !== targetKey) return undefined;
        return buckets.get(`${targetKey}T${String(parsed.getHours()).padStart(2, '0')}`);
      }

      const dayKey = this.toLocalDateKey(rawDate);
      if (!dayKey) return undefined;
      if (!isWeeklyGrouped) {
        return buckets.get(dayKey);
      }

      const d = this.parseLocalDate(dayKey);
      if (!d) return undefined;
      const diff = Math.round((d.getTime() - startDate.getTime()) / msPerDay);
      if (diff < 0 || diff >= spanDays) return undefined;
      return buckets.get(`W-${Math.floor(diff / 7) * 7}`);
    };

    for (const tx of this.transactions()) {
      const bucket = resolveBucket(tx.paidAt || tx.createdAt);
      if (!bucket) continue;
      bucket.allTxCount += 1;
      if (tx.status === 'success') {
        bucket.txCount += 1;
        bucket.grossVolume += tx.amount;
        bucket.commission +=
          tx.platformCommissionAmount || Math.round((tx.amount * rate) / 100);
      }
    }

    for (const bk of this.bookings()) {
      const bucket = resolveBucket(bk.createdAt || bk.date);
      if (bucket) {
        bucket.bookingsCount += 1;
      }
    }

    for (const app of this.vendorApplications()) {
      const bucket = resolveBucket(app.createdAt);
      if (bucket) {
        bucket.onboardingCount += 1;
      }
    }

    for (const biz of this.businesses()) {
      const bucket = resolveBucket(biz.createdAt);
      if (bucket) {
        bucket.onboardingCount += 1;
      }
    }

    const rawSeries = orderedKeys.map((k) => buckets.get(k)!);
    const periodVolume = rawSeries.reduce((s, d) => s + d.grossVolume, 0);
    const periodCommission = rawSeries.reduce((s, d) => s + d.commission, 0);
    const periodTxCount = rawSeries.reduce((s, d) => s + d.txCount, 0);
    const periodAllTxCount = rawSeries.reduce((s, d) => s + d.allTxCount, 0);
    const periodBookings = rawSeries.reduce((s, d) => s + d.bookingsCount, 0);
    const periodOnboardings = rawSeries.reduce((s, d) => s + d.onboardingCount, 0);

    const maxPrimary = Math.max(
      ...rawSeries.map((d) =>
        metric === 'revenue' ? d.grossVolume : Math.max(d.bookingsCount, d.onboardingCount),
      ),
      0,
    );

    const yMax =
      metric === 'revenue'
        ? this.niceCeiling(Math.max(maxPrimary, 10000))
        : this.niceCeiling(Math.max(maxPrimary, 4));

    const width = 760;
    const height = 240;
    const padLeft = 58;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 34;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const baseY = padTop + plotH;

    const bucketCount = rawSeries.length;
    const labelStep = isHourly
      ? 3
      : bucketCount <= 7
        ? 1
        : bucketCount <= 14
          ? 2
          : Math.max(1, Math.ceil(bucketCount / 7));
    const slotW = plotW / Math.max(1, bucketCount);

    const points = rawSeries.map((d, i) => {
      const primaryVal = metric === 'revenue' ? d.grossVolume : d.bookingsCount;
      const secondaryVal = metric === 'revenue' ? d.commission : d.onboardingCount;
      const x =
        rawSeries.length === 1
          ? padLeft + plotW / 2
          : padLeft + (i / (rawSeries.length - 1)) * plotW;
      const yPrimary = baseY - (primaryVal / yMax) * plotH;
      const ySecondary = baseY - (secondaryVal / yMax) * plotH;
      return {
        ...d,
        index: i,
        x,
        slotX: padLeft + i * slotW,
        slotW,
        yPrimary,
        ySecondary,
        primaryVal,
        secondaryVal,
        showLabel: i % labelStep === 0 || i === rawSeries.length - 1,
      };
    });

    const primaryPath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yPrimary.toFixed(1)}`)
      .join(' ');

    const primaryAreaPath =
      points.length > 0
        ? `${primaryPath} L${points[points.length - 1].x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z`
        : '';

    const secondaryPath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.ySecondary.toFixed(1)}`)
      .join(' ');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = Math.round(yMax * ratio);
      const y = baseY - ratio * plotH;
      return {
        y,
        val,
        label: metric === 'revenue' ? this.formatCompactNaira(val) : String(val),
      };
    });

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      baseY,
      periodLabel,
      rangeDescription,
      points,
      primaryPath,
      primaryAreaPath,
      secondaryPath,
      yTicks,
      summary: {
        periodVolume,
        periodCommission,
        periodTxCount,
        periodBookings,
        periodOnboardings,
        avgTxValue: periodTxCount > 0 ? Math.round(periodVolume / periodTxCount) : 0,
        successRate:
          periodAllTxCount > 0 ? Math.round((periodTxCount / periodAllTxCount) * 100) : 100,
      },
    };
  });

  readonly hoveredDayPoint = computed(() => {
    const idx = this.hoveredDayIndex();
    const pts = this.liveChart().points;
    if (idx === null || idx < 0 || idx >= pts.length) return null;
    return pts[idx];
  });

  readonly statusDonut = computed(() => {
    const mode = this.donutMode();
    const radius = 50;
    const circumference = 2 * Math.PI * radius;

    const rawSlices =
      mode === 'payments'
        ? [
            {
              label: 'Settled',
              count: this.transactions().filter((t) => t.status === 'success').length,
              color: '#24684b',
            },
            {
              label: 'Failed',
              count: this.transactions().filter((t) => t.status === 'failed').length,
              color: '#b81d1a',
            },
            {
              label: 'Refunded',
              count: this.transactions().filter((t) => t.status === 'refunded').length,
              color: '#c27803',
            },
          ]
        : [
            {
              label: 'Confirmed',
              count: this.bookings().filter((b) => b.status === 'Confirmed').length,
              color: '#24684b',
            },
            {
              label: 'Completed',
              count: this.bookings().filter((b) => b.status === 'Completed').length,
              color: '#3b0b0b',
            },
            {
              label: 'Pending',
              count: this.bookings().filter((b) => b.status === 'Pending').length,
              color: '#c27803',
            },
            {
              label: 'Cancelled',
              count: this.bookings().filter((b) => b.status === 'Cancelled').length,
              color: '#b81d1a',
            },
          ];

    const total = rawSlices.reduce((s, item) => s + item.count, 0);
    let offset = 0;

    const segments = rawSlices.map((item) => {
      const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
      const segLen = total > 0 ? (item.count / total) * circumference : 0;
      const segment = {
        ...item,
        pct,
        dashArray: `${segLen.toFixed(2)} ${circumference.toFixed(2)}`,
        dashOffset: (-offset).toFixed(2),
      };
      offset += segLen;
      return segment;
    });

    return {
      total,
      radius,
      circumference,
      segments,
    };
  });

  readonly topStudiosAnalytics = computed(() => {
    const map = new Map<
      string,
      { name: string; revenue: number; txCount: number; bookingCount: number }
    >();

    for (const biz of this.businesses()) {
      map.set(biz.name, {
        name: biz.name,
        revenue: 0,
        txCount: 0,
        bookingCount: 0,
      });
    }

    for (const tx of this.transactions()) {
      if (tx.status !== 'success') continue;
      const entry = map.get(tx.businessName) ?? {
        name: tx.businessName,
        revenue: 0,
        txCount: 0,
        bookingCount: 0,
      };
      entry.revenue += tx.amount;
      entry.txCount += 1;
      map.set(tx.businessName, entry);
    }

    for (const bk of this.bookings()) {
      const entry = map.get(bk.businessName) ?? {
        name: bk.businessName,
        revenue: 0,
        txCount: 0,
        bookingCount: 0,
      };
      entry.bookingCount += 1;
      map.set(bk.businessName, entry);
    }

    const sorted = Array.from(map.values())
      .filter((s) => s.revenue > 0 || s.bookingCount > 0)
      .sort((a, b) => b.revenue - a.revenue || b.bookingCount - a.bookingCount)
      .slice(0, 5);

    const maxRev = Math.max(1, ...sorted.map((s) => s.revenue || s.bookingCount));
    return sorted.map((s) => ({
      ...s,
      barPct: Math.max(12, Math.round(((s.revenue || s.bookingCount) / maxRev) * 100)),
    }));
  });

  private toLocalDateKey(raw: string | undefined): string | null {
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private niceCeiling(val: number): number {
    if (val <= 4) return 4;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    const norm = val / mag;
    if (norm <= 1.2) return 1.2 * mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 4) return 4 * mag;
    if (norm <= 6) return 6 * mag;
    if (norm <= 8) return 8 * mag;
    return 10 * mag;
  }

  formatCompactNaira(amount: number): string {
    if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `₦${Math.round(amount / 1_000)}k`;
    return `₦${amount}`;
  }

  readonly incomingApplications = computed(() =>
    this.vendorApplications().filter((a) => a.status !== 'paid_live'),
  );

  readonly completedApplications = computed(() =>
    this.vendorApplications().filter((a) => a.status === 'paid_live'),
  );

  readonly unseenCompletedApplications = computed(() => {
    const dismissed = new Set(this.dismissedOnboardingNumbers());
    return this.completedApplications().filter(
      (a) => !dismissed.has(a.applicationNumber),
    );
  });

  dismissCompletedNotice(): void {
    const next = Array.from(
      new Set([
        ...this.dismissedOnboardingNumbers(),
        ...this.completedApplications().map((a) => a.applicationNumber),
      ]),
    );
    this.dismissedOnboardingNumbers.set(next);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.dismissedOnboardingsKey, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
    }
  }

  private loadDismissedOnboardings(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.dismissedOnboardingsKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string')
        : [];
    } catch {
      return [];
    }
  }

  readonly filteredApplications = computed(() => {
    const f = this.applicationFilter();
    return this.incomingApplications().filter((a) => f === 'all' || a.status === f);
  });

  readonly pendingApplicationsCount = computed(
    () => this.vendorApplications().filter((a) => a.status === 'pending').length,
  );

  readonly filteredStudios = computed(() => {
    const q = this.studioSearch().trim().toLowerCase();
    const cat = this.studioCategoryFilter();
    const st = this.studioStatusFilter();

    return this.businesses().filter((biz) => {
      if (cat !== 'all' && biz.categorySlug !== cat) return false;
      const effectiveStatus = biz.status ?? 'active';
      if (st !== 'all' && effectiveStatus !== st) return false;
      if (!q) return true;
      return (
        biz.name.toLowerCase().includes(q) ||
        biz.location.toLowerCase().includes(q) ||
        biz.slug.toLowerCase().includes(q) ||
        biz.contact.email.toLowerCase().includes(q)
      );
    });
  });

  readonly filteredTransactions = computed(() => {
    const status = this.paymentFilter();
    const q = this.paymentSearch().trim().toLowerCase();
    return this.transactions().filter((tx) => {
      if (status !== 'all' && tx.status !== status) return false;
      if (!q) return true;
      return (
        tx.businessName.toLowerCase().includes(q) ||
        tx.customerName.toLowerCase().includes(q) ||
        tx.customerEmail.toLowerCase().includes(q) ||
        (tx.gatewayReference ?? '').toLowerCase().includes(q) ||
        this.marketplace.formatDateTime(tx.paidAt || tx.createdAt).toLowerCase().includes(q)
      );
    });
  });

  readonly filteredActivityLogs = computed(() => {
    const category = this.logCategoryFilter();
    const q = this.logSearch().trim().toLowerCase();
    return this.activityLogs().filter((log) => {
      if (category !== 'all' && log.category !== category) return false;
      if (!q) return true;
      return (
        log.summary.toLowerCase().includes(q) ||
        log.eventType.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        (log.actorEmail ?? '').toLowerCase().includes(q) ||
        log.actorRole.toLowerCase().includes(q) ||
        (log.entityName ?? '').toLowerCase().includes(q) ||
        (log.entityId ?? '').toLowerCase().includes(q) ||
        this.marketplace.formatDateTime(log.createdAt).toLowerCase().includes(q)
      );
    });
  });

  readonly allReviews = computed(() => {
    const list: Array<{
      id: string;
      businessSlug: string;
      businessName: string;
      author: string;
      rating: number;
      serviceName: string;
      dateLabel: string;
      comment: string;
      status: string;
    }> = [];
    for (const biz of this.businesses()) {
      for (const rev of biz.reviews) {
        list.push({
          ...rev,
          businessSlug: biz.slug,
          businessName: biz.name,
          status: rev.status || 'published',
        });
      }
    }
    return list;
  });

  // ==========================================================================
  // VENDOR MANAGEMENT ACTIONS
  // ==========================================================================
  toggleCreateVendorForm(): void {
    const opening = !this.showCreateVendor();
    this.showCreateVendor.set(opening);
    this.showInviteVendor.set(false);
    if (opening) {
      const firstCat = this.categories()[0]?.slug;
      if (firstCat && !this.categories().some((c) => c.slug === this.newVendor.categorySlug)) {
        this.newVendor.categorySlug = firstCat;
      }
    }
  }

  toggleInviteVendorForm(): void {
    const opening = !this.showInviteVendor();
    this.showInviteVendor.set(opening);
    this.showCreateVendor.set(false);
    if (opening) {
      const firstCat = this.categories()[0]?.slug;
      if (firstCat && !this.categories().some((c) => c.slug === this.inviteForm.categorySlug)) {
        this.inviteForm.categorySlug = firstCat;
      }
    }
  }

  async submitCreateVendor(): Promise<void> {
    if (!this.newVendor.businessName.trim() || !this.newVendor.email.trim()) {
      this.flash('Enter Business Name and Vendor Email.');
      return;
    }
    if (!this.newVendor.password || this.newVendor.password.length < 6) {
      this.flash('Enter a temporary password (minimum 6 characters) for the vendor login.');
      return;
    }
    const resolvedCategory = this.categories().some((c) => c.slug === this.newVendor.categorySlug)
      ? this.newVendor.categorySlug
      : this.categories()[0]?.slug || this.newVendor.categorySlug;

    const res = await this.marketplace.createVendorAccount({
      fullName: this.newVendor.fullName || 'Studio Owner',
      email: this.newVendor.email,
      password: this.newVendor.password,
      phone: this.newVendor.phone,
      businessName: this.newVendor.businessName,
      categorySlug: resolvedCategory,
      city: this.newVendor.city,
      location: this.newVendor.location || this.newVendor.city,
    });
    this.showCreateVendor.set(false);
    this.newVendor = {
      fullName: '',
      email: '',
      password: '',
      phone: '',
      businessName: '',
      categorySlug: this.categories()[0]?.slug || ('hairdressers' as CategorySlug),
      city: 'Lagos',
      location: '',
    };
    this.flash(res.message);
  }

  submitInviteVendor(): void {
    if (!this.inviteForm.email.trim() || !this.inviteForm.businessName.trim()) {
      this.flash('Enter email and studio name to send an invite.');
      return;
    }
    const resolvedCategory = this.categories().some((c) => c.slug === this.inviteForm.categorySlug)
      ? this.inviteForm.categorySlug
      : this.categories()[0]?.slug || this.inviteForm.categorySlug;

    const inv = this.marketplace.inviteVendor({
      ...this.inviteForm,
      categorySlug: resolvedCategory,
    });
    this.showInviteVendor.set(false);
    this.inviteForm = {
      email: '',
      businessName: '',
      categorySlug: this.categories()[0]?.slug || ('hairdressers' as CategorySlug),
      city: 'Lagos',
    };
    this.flash(`Vendor invitation created (token: ${inv.inviteToken}).`);
  }

  copyInviteLink(token: string): void {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    const url = `${window.location.origin}/auth?invite=${token}`;
    void navigator.clipboard.writeText(url);
    this.flash(`Copied invite link: ${url}`);
  }

  openApplicationView(biz: BusinessProfile): void {
    this.viewingApplication.set(biz);
  }

  closeApplicationView(): void {
    this.viewingApplication.set(null);
  }

  async approveVendor(slug: string): Promise<void> {
    this.busyStudioSlug.set(slug);
    try {
      const res = await this.marketplace.setBusinessStatus(slug, 'active');
      if (!res.ok) {
        this.flash(res.error || `Could not approve studio: ${slug}`);
        return;
      }
      this.viewingApplication.set(null);
      this.flash(`Approved & activated studio: ${slug}`);
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  async declineVendor(biz: BusinessProfile): Promise<void> {
    this.busyStudioSlug.set(biz.slug);
    try {
      const res = await this.marketplace.deleteBusiness(biz.slug);
      if (!res.ok) {
        this.flash(res.error || `Could not decline studio: ${biz.name}`);
        return;
      }
      this.viewingApplication.set(null);
      this.flash(`Declined vendor application: ${biz.name}`);
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  inspectApplication(app: VendorApplication): void {
    if (this.viewingApplicationNum() === app.applicationNumber) {
      this.viewingApplicationNum.set(null);
      this.applicationReviewNote = '';
    } else {
      this.viewingApplicationNum.set(app.applicationNumber);
      this.applicationReviewNote = app.adminNote || '';
    }
  }

  async decideApplication(appNumber: string, decision: 'approved' | 'declined'): Promise<void> {
    this.reviewingAppNum.set(appNumber);
    try {
      const res = await this.marketplace.reviewVendorApplication(
        appNumber,
        decision,
        this.applicationReviewNote,
      );
      if (!res.ok || !res.application) {
        this.flash(res.error || 'Could not update application.');
        return;
      }
      this.viewingApplicationNum.set(null);
      this.applicationReviewNote = '';
      this.flash(
        decision === 'approved'
          ? `Accepted ${res.application.businessName} (${res.application.applicationNumber}). Vendor can now pay onboarding fee & go live.`
          : `Declined ${res.application.businessName} (${res.application.applicationNumber}).`,
      );
    } finally {
      this.reviewingAppNum.set(null);
    }
  }

  copyApplicationPayLink(appNumber: string): void {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    const url = `${window.location.origin}/apply?app=${encodeURIComponent(appNumber)}`;
    void navigator.clipboard.writeText(url);
    this.flash(`Copied onboarding payment link: ${url}`);
  }

  startEditVendor(biz: BusinessProfile): void {
    if (this.editingVendorSlug() === biz.slug) {
      this.editingVendorSlug.set(null);
      return;
    }
    this.settingPasswordSlug.set(null);
    this.editingVendorSlug.set(biz.slug);
    this.editVendorForm = {
      name: biz.name,
      categorySlug: biz.categorySlug,
      city: biz.city,
      location: biz.location,
      address: biz.address,
      phone: biz.contact.phone,
      email: biz.contact.email,
      tagline: biz.tagline,
    };
  }

  getVendorCreds(biz: BusinessProfile): { email: string; tempPassword: string | null } {
    const creds = this.marketplace.getVendorCredential(biz.slug, biz.contact?.email);
    return {
      email: creds.email || biz.contact?.email || '',
      tempPassword: creds.tempPassword,
    };
  }

  isPasswordRevealed(key: string): boolean {
    return this.revealedPasswordSlugs().has((key || '').toLowerCase());
  }

  toggleRevealPassword(key: string): void {
    const normalized = (key || '').toLowerCase();
    const next = new Set(this.revealedPasswordSlugs());
    if (next.has(normalized)) {
      next.delete(normalized);
    } else {
      next.add(normalized);
    }
    this.revealedPasswordSlugs.set(next);
  }

  copyCredentialText(value: string, label: string): void {
    if (!value || typeof window === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value);
    this.flash(`Copied ${label} to clipboard.`);
  }

  openSetPassword(biz: BusinessProfile): void {
    if (this.settingPasswordSlug() === biz.slug) {
      this.settingPasswordSlug.set(null);
      return;
    }
    this.editingVendorSlug.set(null);
    const creds = this.getVendorCreds(biz);
    this.passwordResetForm = {
      email: creds.email || biz.contact?.email || '',
      newPassword: creds.tempPassword || '',
    };
    this.settingPasswordSlug.set(biz.slug);
  }

  async saveVendorPassword(biz: BusinessProfile): Promise<void> {
    const email = this.passwordResetForm.email.trim().toLowerCase();
    const newPassword = this.passwordResetForm.newPassword.trim();
    if (!email || newPassword.length < 6) {
      this.flash('Enter a valid vendor login email and a password of at least 6 characters.');
      return;
    }

    this.busyStudioSlug.set(biz.slug);
    try {
      const res = await this.marketplace.setVendorPassword(biz.slug, email, newPassword);
      if (!res.ok) {
        this.flash(res.error || `Could not update login password for ${biz.name}.`);
        return;
      }
      const next = new Set(this.revealedPasswordSlugs());
      next.add(biz.slug.toLowerCase());
      this.revealedPasswordSlugs.set(next);
      this.settingPasswordSlug.set(null);
      this.flash(`Updated login & password for ${biz.name} (${email}).`);
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  async saveVendorEdit(biz: BusinessProfile): Promise<void> {
    this.busyStudioSlug.set(biz.slug);
    try {
      const nextName = this.editVendorForm.name.trim() || biz.name;
      const res = await this.marketplace.saveStudioConfiguration(biz.slug, {
        name: nextName,
        categorySlug: this.editVendorForm.categorySlug,
        city: this.editVendorForm.city.trim() || biz.city,
        location: this.editVendorForm.location.trim() || biz.location,
        address: this.editVendorForm.address.trim() || biz.address,
        tagline: this.editVendorForm.tagline.trim(),
        contact: {
          ...biz.contact,
          phone: this.editVendorForm.phone.trim(),
          email: this.editVendorForm.email.trim(),
        },
      });
      if (!res.ok) {
        this.flash(res.error || `Could not save changes for ${nextName}.`);
        return;
      }
      this.editingVendorSlug.set(null);
      this.flash(`Updated vendor profile for ${nextName}.`);
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  async toggleVerified(slug: string): Promise<void> {
    this.busyStudioSlug.set(slug);
    try {
      const res = await this.marketplace.toggleBusinessVerified(slug);
      if (!res.ok) {
        this.flash(res.error || `Could not update verification status for ${slug}.`);
        return;
      }
      this.flash(
        res.verified ? `Studio ${slug} marked Verified.` : `Removed verification from ${slug}.`,
      );
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  async toggleFeatured(slug: string): Promise<void> {
    this.busyStudioSlug.set(slug);
    try {
      const res = await this.marketplace.toggleBusinessFeatured(slug);
      if (!res.ok) {
        this.flash(res.error || `Could not update featured status for ${slug}.`);
        return;
      }
      this.flash(
        res.featured ? `Studio ${slug} is now Featured.` : `Removed ${slug} from Featured.`,
      );
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  async toggleSuspend(slug: string, currentStatus?: StudioStatus): Promise<void> {
    const next: StudioStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    this.busyStudioSlug.set(slug);
    try {
      const res = await this.marketplace.setBusinessStatus(slug, next);
      if (!res.ok) {
        this.flash(res.error || `Could not update status for ${slug}.`);
        return;
      }
      this.flash(`Studio ${slug} is now ${next}.`);
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  async deleteVendor(slug: string, name: string): Promise<void> {
    this.busyStudioSlug.set(slug);
    try {
      const res = await this.marketplace.deleteBusiness(slug);
      if (!res.ok) {
        this.flash(res.error || `Could not delete studio ${name}.`);
        return;
      }
      if (this.editingVendorSlug() === slug) {
        this.editingVendorSlug.set(null);
      }
      this.flash(`Deleted vendor account & studio: ${name}`);
    } finally {
      this.busyStudioSlug.set(null);
    }
  }

  // ==========================================================================
  // CATEGORY MANAGEMENT ACTIONS
  // ==========================================================================
  editCategory(cat: CategoryInfo): void {
    this.editingCategorySlug.set(cat.slug);
    this.categoryForm = {
      slug: cat.slug,
      name: cat.name,
      shortName: cat.shortName,
      tagline: cat.tagline,
      description: cat.description,
      coverImage: cat.coverImage,
      tagsText: cat.popularTags.join(', '),
    };
  }

  resetCategoryForm(): void {
    this.editingCategorySlug.set(null);
    this.categoryForm = {
      slug: '',
      name: '',
      shortName: '',
      tagline: '',
      description: '',
      coverImage: 'images/cat-hairdressers.jpg',
      tagsText: '',
    };
  }

  async onCategoryImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const url = await this.marketplace.uploadStudioImage(file, 'categories');
    this.categoryForm.coverImage = url;
  }

  saveCategory(): void {
    if (!this.categoryForm.name.trim()) {
      this.flash('Category Name is required.');
      return;
    }
    const tags = this.categoryForm.tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const saved = this.marketplace.upsertCategory({
      slug: this.editingCategorySlug() || this.categoryForm.slug || this.categoryForm.name,
      name: this.categoryForm.name.trim(),
      shortName: this.categoryForm.shortName.trim() || this.categoryForm.name.trim(),
      tagline: this.categoryForm.tagline.trim(),
      description: this.categoryForm.description.trim(),
      coverImage: this.categoryForm.coverImage.trim() || 'images/cat-hairdressers.jpg',
      popularTags: tags,
    });

    this.flash(`Saved category "${saved.name}".`);
    this.resetCategoryForm();
  }

  removeCategory(slug: string): void {
    this.marketplace.deleteCategory(slug);
    this.flash(`Deleted category: ${slug}`);
  }

  // ==========================================================================
  // SETTINGS, CUSTOMERS & REVIEWS
  // ==========================================================================
  saveOnboardingFee(): void {
    const fee = Math.max(0, Number(this.onboardingFeeInput) || 0);
    this.onboardingFeeInput = fee;
    this.marketplace.updatePlatformSettings({ vendorOnboardingFee: fee });
    this.flash(
      `Vendor onboarding fee updated to ${this.marketplace.formatNaira(fee)} for new and awaiting applications.`,
    );
  }

  savePlatformSettings(): void {
    this.marketplace.updatePlatformSettings(this.settingsDraft);
    this.flash('Saved platform commission, onboarding fee, website content & notification rules.');
  }

  toggleCustomerStatus(id: string, current: AccountStatus): void {
    const next: AccountStatus = current === 'suspended' ? 'active' : 'suspended';
    this.marketplace.setCustomerAccountStatus(id, next);
    this.flash(`Customer account set to ${next}.`);
  }

  toggleReviewVisibility(businessSlug: string, reviewId: string, currentStatus: string): void {
    const next = currentStatus === 'hidden' ? 'published' : 'hidden';
    this.marketplace.setReviewStatus(businessSlug, reviewId, next);
    this.flash(`Review visibility updated to ${next}.`);
  }

  removeReview(businessSlug: string, reviewId: string): void {
    this.marketplace.deleteReview(businessSlug, reviewId);
    this.flash('Review deleted.');
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => {
      if (this.toast() === msg) this.toast.set('');
    }, 3800);
  }
}
