import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AccountStatus,
  BookingStatus,
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

  readonly categories = this.marketplace.categories;
  readonly businesses = this.marketplace.businesses;
  readonly bookings = this.marketplace.bookings;
  readonly transactions = this.marketplace.transactions;
  readonly invitations = this.marketplace.vendorInvitations;
  readonly vendorApplications = this.marketplace.vendorApplications;

  readonly activeTab = signal<
    'overview' | 'vendors' | 'categories' | 'bookings' | 'payments' | 'settings'
  >('overview');
  readonly toast = signal('');

  // Vendor Applications review state
  readonly applicationFilter = signal<'all' | VendorApplicationStatus>('all');
  readonly viewingApplicationNum = signal<string | null>(null);
  applicationReviewNote = '';

  // Vendor Management filters & forms
  readonly studioSearch = signal('');
  readonly studioCategoryFilter = signal<CategorySlug | 'all'>('all');
  readonly studioStatusFilter = signal<'all' | StudioStatus>('all');
  readonly showCreateVendor = signal(false);
  readonly showInviteVendor = signal(false);
  readonly editingVendorSlug = signal<string | null>(null);
  readonly viewingApplication = signal<BusinessProfile | null>(null);

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

  // Booking Management filters
  readonly ledgerSearch = signal('');
  readonly ledgerCategoryFilter = signal<CategorySlug | 'all'>('all');
  readonly ledgerBusinessFilter = signal<string>('all');
  readonly ledgerStatusFilter = signal<'all' | BookingStatus>('all');

  // Payment Management filters
  readonly paymentFilter = signal<'all' | 'success' | 'failed' | 'refunded'>('all');
  readonly paymentSearch = signal('');

  // Platform Settings & Customer Accounts
  readonly customerSearch = signal('');
  settingsDraft: PlatformSettings = { ...this.marketplace.platformSettings() };

  readonly uniqueCustomers = computed(() => {
    const map = new Map<
      string,
      { id: string; fullName: string; email: string; phone: string; status: AccountStatus; bookings: number }
    >();
    for (const acc of this.marketplace.customerAccounts()) {
      if (acc.role !== 'customer') continue;
      map.set(acc.email.toLowerCase(), {
        id: acc.id,
        fullName: acc.fullName,
        email: acc.email,
        phone: acc.phone,
        status: acc.status,
        bookings: 0,
      });
    }
    for (const b of this.bookings()) {
      const key = b.customerEmail.toLowerCase();
      const existing = map.get(key) ?? {
        id: `bk-cust-${key}`,
        fullName: b.customerName,
        email: b.customerEmail,
        phone: b.customerPhone,
        status: 'active' as AccountStatus,
        bookings: 0,
      };
      existing.bookings += 1;
      map.set(key, existing);
    }
    return Array.from(map.values());
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

    const allBookings = this.bookings();
    const validBookings = allBookings.filter((b) => b.status !== 'Cancelled');
    const grossBookingValue = validBookings.reduce((s, b) => s + b.servicePrice, 0);
    const paystackCollected = validBookings.reduce((s, b) => s + b.amountPaid, 0);
    const balanceAtStudios = validBookings.reduce((s, b) => s + b.balanceDue, 0);
    const rate = this.marketplace.platformSettings().commissionRate || 10;
    const platformCommission = Math.round((paystackCollected * rate) / 100);

    const txs = this.transactions();
    const successTx = txs.filter((t) => t.status === 'success');
    const failedTx = txs.filter((t) => t.status === 'failed');

    return {
      totalStudios: allBiz.length,
      activeStudios,
      pendingStudios,
      suspendedStudios,
      verifiedStudios,
      featuredStudios,
      totalCustomers: this.uniqueCustomers().length,
      totalBookings: allBookings.length,
      validBookingsCount: validBookings.length,
      grossBookingValue,
      paystackCollected,
      balanceAtStudios,
      platformCommission,
      commissionRate: rate,
      successTxCount: successTx.length,
      successTxVolume: successTx.reduce((s, t) => s + t.amount, 0),
      failedTxCount: failedTx.length,
      failedTxVolume: failedTx.reduce((s, t) => s + t.amount, 0),
    };
  });

  readonly categoryBreakdown = computed(() => {
    const validBookings = this.bookings().filter((b) => b.status !== 'Cancelled');
    const bizMap = new Map(this.businesses().map((b) => [b.slug, b]));

    const rows = this.categories().map((cat) => {
      const studios = this.businesses().filter((b) => b.categorySlug === cat.slug);
      const catBookings = validBookings.filter(
        (bk) => bizMap.get(bk.businessSlug)?.categorySlug === cat.slug,
      );
      const volume = catBookings.reduce((sum, bk) => sum + bk.servicePrice, 0);
      return {
        slug: cat.slug,
        name: cat.shortName,
        studioCount: studios.length,
        bookingCount: catBookings.length,
        volume,
      };
    });

    const maxVol = Math.max(1, ...rows.map((r) => r.volume));
    return rows
      .map((r) => ({
        ...r,
        barWidthPct: Math.max(r.studioCount > 0 ? 12 : 0, Math.round((r.volume / maxVol) * 100)),
      }))
      .sort((a, b) => b.bookingCount - a.bookingCount || b.volume - a.volume);
  });

  readonly studioStatsMap = computed(() => {
    const map = new Map<string, { bookings: number; revenue: number }>();
    for (const bk of this.bookings()) {
      if (bk.status === 'Cancelled') continue;
      const cur = map.get(bk.businessSlug) ?? { bookings: 0, revenue: 0 };
      cur.bookings += 1;
      cur.revenue += bk.amountPaid;
      map.set(bk.businessSlug, cur);
    }
    return map;
  });

  readonly filteredApplications = computed(() => {
    const f = this.applicationFilter();
    return this.vendorApplications().filter((a) => f === 'all' || a.status === f);
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

  readonly filteredLedger = computed(() => {
    const q = this.ledgerSearch().trim().toLowerCase();
    const cat = this.ledgerCategoryFilter();
    const bizFilter = this.ledgerBusinessFilter();
    const st = this.ledgerStatusFilter();
    const bizMap = new Map(this.businesses().map((b) => [b.slug, b]));

    return this.bookings().filter((b) => {
      if (st !== 'all' && b.status !== st) return false;
      if (bizFilter !== 'all' && b.businessSlug !== bizFilter) return false;
      if (cat !== 'all') {
        const bCat = b.categorySlug || bizMap.get(b.businessSlug)?.categorySlug;
        if (bCat !== cat) return false;
      }
      if (!q) return true;
      return (
        b.bookingReference.toLowerCase().includes(q) ||
        b.businessName.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.serviceName.toLowerCase().includes(q) ||
        (b.paystackReference ?? '').toLowerCase().includes(q)
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
        tx.bookingReference.toLowerCase().includes(q) ||
        tx.businessName.toLowerCase().includes(q) ||
        tx.customerName.toLowerCase().includes(q) ||
        (tx.gatewayReference ?? '').toLowerCase().includes(q)
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

  approveVendor(slug: string): void {
    this.marketplace.setBusinessStatus(slug, 'active');
    this.viewingApplication.set(null);
    this.flash(`Approved & activated studio: ${slug}`);
  }

  declineVendor(biz: BusinessProfile): void {
    this.marketplace.deleteBusiness(biz.slug);
    this.viewingApplication.set(null);
    this.flash(`Declined vendor application: ${biz.name}`);
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

  decideApplication(appNumber: string, decision: 'approved' | 'declined'): void {
    const updated = this.marketplace.reviewVendorApplication(
      appNumber,
      decision,
      this.applicationReviewNote,
    );
    if (!updated) return;
    this.viewingApplicationNum.set(null);
    this.applicationReviewNote = '';
    this.flash(
      decision === 'approved'
        ? `Accepted ${updated.businessName} (${updated.applicationNumber}). Vendor can now pay onboarding fee & go live.`
        : `Declined ${updated.businessName} (${updated.applicationNumber}).`,
    );
  }

  startEditVendor(biz: BusinessProfile): void {
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

  saveVendorEdit(biz: BusinessProfile): void {
    this.marketplace.updateStudioConfiguration(biz.slug, {
      name: this.editVendorForm.name.trim() || biz.name,
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
    this.editingVendorSlug.set(null);
    this.flash(`Updated vendor profile for ${this.editVendorForm.name}.`);
  }

  toggleVerified(slug: string): void {
    this.marketplace.toggleBusinessVerified(slug);
  }

  toggleFeatured(slug: string): void {
    this.marketplace.toggleBusinessFeatured(slug);
  }

  toggleSuspend(slug: string, currentStatus?: StudioStatus): void {
    const next: StudioStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    this.marketplace.setBusinessStatus(slug, next);
    this.flash(`Studio ${slug} is now ${next}.`);
  }

  deleteVendor(slug: string, name: string): void {
    this.marketplace.deleteBusiness(slug);
    this.flash(`Deleted vendor account & studio: ${name}`);
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
  // BOOKINGS, SETTINGS, CUSTOMERS & REVIEWS
  // ==========================================================================
  setBookingStatus(ref: string, status: BookingStatus): void {
    this.marketplace.updateBookingStatus(ref, status);
    this.flash(`Booking ${ref} marked ${status}.`);
  }

  markBookingPaid(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Confirmed', 'Paid');
    this.flash(`Booking ${ref} marked Paid.`);
  }

  savePlatformSettings(): void {
    this.marketplace.updatePlatformSettings(this.settingsDraft);
    this.flash('Saved platform commission, website content & notification rules.');
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
