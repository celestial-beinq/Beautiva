import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AccountStatus,
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

  async logout(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigate(['/auth']);
  }

  readonly categories = this.marketplace.categories;
  readonly businesses = this.marketplace.businesses;
  readonly transactions = this.marketplace.transactions;
  readonly invitations = this.marketplace.vendorInvitations;
  readonly vendorApplications = this.marketplace.vendorApplications;

  readonly activeTab = signal<
    'overview' | 'vendors' | 'categories' | 'payments' | 'settings'
  >('overview');
  readonly toast = signal('');

  // Vendor Applications review state
  readonly applicationFilter = signal<'all' | VendorApplicationStatus>('all');
  readonly viewingApplicationNum = signal<string | null>(null);
  readonly reviewingAppNum = signal<string | null>(null);
  applicationReviewNote = '';

  // Vendor Management filters & forms
  readonly studioSearch = signal('');
  readonly studioCategoryFilter = signal<CategorySlug | 'all'>('all');
  readonly studioStatusFilter = signal<'all' | StudioStatus>('all');
  readonly showCreateVendor = signal(false);
  readonly showInviteVendor = signal(false);
  readonly editingVendorSlug = signal<string | null>(null);
  readonly busyStudioSlug = signal<string | null>(null);
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

  // Payment Management filters
  readonly paymentFilter = signal<'all' | 'success' | 'failed' | 'refunded'>('all');
  readonly paymentSearch = signal('');

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
  }

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
