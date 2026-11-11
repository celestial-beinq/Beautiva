import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DEFAULT_WORKING_HOURS } from '../../data/seed-data';
import {
  AvailabilitySettings,
  BookingStatus,
  BusinessContact,
  BusinessProfile,
  CategorySlug,
  PaymentPolicy,
  ServiceItem,
  StaffMember,
  WorkingHours,
} from '../../models/marketplace.models';
import { TablePaginationComponent } from '../../components/table-pagination/table-pagination.component';
import { AuthService } from '../../services/auth.service';
import {
  DEFAULT_AVAILABILITY,
  DEFAULT_TIME_SLOTS,
  MarketplaceService,
} from '../../services/marketplace.service';

@Component({
  selector: 'app-vendor-studio',
  standalone: true,
  imports: [RouterLink, FormsModule, TablePaginationComponent],
  templateUrl: './vendor-studio.component.html',
  styleUrl: './vendor-studio.component.css',
})
export class VendorStudioComponent {
  readonly marketplace = inject(MarketplaceService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigate(['/auth']);
  }

  readonly categories = this.marketplace.categories;
  readonly businesses = this.marketplace.businesses;
  readonly bookings = this.marketplace.bookings;

  readonly activeTab = signal<
    'bookings' | 'profile' | 'menu' | 'availability' | 'analytics' | 'customers' | 'builder'
  >('bookings');
  readonly selectedStudioSlug = signal<string>(this.auth.demoVendorStudioSlug() || '');
  readonly bookingStatusFilter = signal<'all' | BookingStatus>('all');
  readonly bookingSearch = signal('');
  readonly bookingPage = signal(1);
  readonly bookingPageSize = signal(10);
  readonly customerSearch = signal('');
  readonly saveToast = signal('');

  // Reschedule inline state
  readonly reschedulingRef = signal<string | null>(null);
  rescheduleDate = '';
  rescheduleTime = '10:00 AM';

  // Editable Profile fields
  profileForm = {
    name: '',
    tagline: '',
    about: '',
    city: 'Lagos',
    location: '',
    address: '',
    logoImage: '',
    coverImage: 'images/cat-hairdressers.jpg',
    phone: '',
    email: '',
    instagram: '',
    facebook: '',
    tiktok: '',
    website: '',
  };

  // Editable Services, Team, Hours, Availability & Payment Policy
  editGallery: string[] = [];
  readonly uploadingGallery = signal(false);
  editServices: ServiceItem[] = [];
  editStaff: StaffMember[] = [];

  readonly serviceModalOpen = signal(false);
  readonly editingServiceId = signal<string | null>(null);
  readonly serviceModalError = signal('');
  serviceDraft: ServiceItem = this.createEmptyServiceDraft();

  readonly staffModalOpen = signal(false);
  readonly editingStaffId = signal<string | null>(null);
  readonly staffModalError = signal('');
  staffDraft: StaffMember = this.createEmptyStaffDraft();
  editHours: WorkingHours[] = [];
  editAvailability: AvailabilitySettings = {
    ...DEFAULT_AVAILABILITY,
    blockedDates: [],
    breaks: [],
    enabledSlots: [...DEFAULT_TIME_SLOTS],
  };
  editPolicy: PaymentPolicy = {
    allowFull: true,
    allowDeposit: false,
    depositPercent: 0,
    allowPayAtBusiness: false,
  };

  newBlockedDate = '';
  newCustomSlot = '';
  newBreak = {
    day: 'All Days',
    start: '01:00 PM',
    end: '02:00 PM',
    label: 'Lunch Break',
  };

  // New Studio Website Builder state
  readonly publishedSlug = signal<string | null>(null);
  readonly formError = signal('');
  businessName = '';
  customSlug = '';
  categorySlug: CategorySlug = 'hairdressers';
  tagline = '';
  about = '';
  city = 'Lagos';
  location = '';
  address = '';
  phone = '';
  email = '';
  instagram = '';
  coverImage = 'images/cat-hairdressers.jpg';
  galleryImages: string[] = [];

  allowFull = true;
  allowDeposit = false;
  depositPercent = 0;
  allowPayAtBusiness = false;

  services: ServiceItem[] = [
    {
      id: `srv-custom-${Date.now()}`,
      name: 'Signature Session',
      categoryLabel: 'Signature',
      price: 20000,
      durationMinutes: 90,
      description: 'Personalized luxury treatment with consultation included.',
      isActive: true,
    },
  ];

  staff: StaffMember[] = [
    {
      id: `stf-custom-${Date.now()}`,
      name: 'Lead Specialist',
      role: 'Founder & Lead Artist',
      specialty: 'Signature Styling',
      avatarColor: '#92745b',
    },
  ];

  readonly availableStudios = computed(() => {
    const user = this.auth.currentUser();
    const all = this.businesses();
    if (this.auth.authMode() === 'supabase' && user?.role === 'vendor') {
      const owned = all.filter((b) => b.ownerId === user.id);
      if (owned.length > 0) return owned;
    }
    return all;
  });

  readonly activeStudio = computed<BusinessProfile | undefined>(() => {
    const list = this.availableStudios();
    return list.find((b) => b.slug === this.selectedStudioSlug()) ?? list[0];
  });

  readonly studioBookings = computed(() => {
    const slug = this.activeStudio()?.slug;
    if (!slug) return [];
    return this.bookings().filter((b) => b.businessSlug === slug);
  });

  readonly filteredStudioBookings = computed(() => {
    const status = this.bookingStatusFilter();
    const q = this.bookingSearch().trim().toLowerCase();
    return this.studioBookings().filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (!q) return true;
      return (
        b.bookingReference.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.serviceName.toLowerCase().includes(q) ||
        b.customerPhone.toLowerCase().includes(q)
      );
    });
  });

  readonly pagedStudioBookings = computed(() => {
    const items = this.filteredStudioBookings();
    const size = Math.max(1, this.bookingPageSize());
    const totalPages = Math.max(1, Math.ceil(items.length / size));
    const safePage = Math.min(Math.max(1, this.bookingPage()), totalPages);
    const start = (safePage - 1) * size;
    return items.slice(start, start + size);
  });

  readonly studioMetrics = computed(() => {
    const all = this.studioBookings();
    const todayIso = new Date().toISOString().slice(0, 10);
    const valid = all.filter((b) => b.status !== 'Cancelled');
    const totalEarnings = valid.reduce((sum, b) => sum + b.amountPaid, 0);
    const pendingBalance = valid.reduce((sum, b) => sum + b.balanceDue, 0);
    const todayCount = all.filter((b) => b.date === todayIso && b.status !== 'Cancelled').length;
    const upcomingCount = all.filter(
      (b) => (b.status === 'Confirmed' || b.status === 'Pending') && b.date >= todayIso,
    ).length;
    const completedCount = all.filter((b) => b.status === 'Completed').length;
    const cancelledCount = all.filter((b) => b.status === 'Cancelled').length;

    return {
      totalBookings: all.length,
      todayCount,
      upcomingCount,
      completedCount,
      cancelledCount,
      totalEarnings,
      pendingBalance,
    };
  });

  readonly vendorCustomers = computed(() => {
    const slug = this.activeStudio()?.slug;
    if (!slug) return [];
    return this.marketplace.getVendorCustomers(slug);
  });

  readonly filteredCustomers = computed(() => {
    const q = this.customerSearch().trim().toLowerCase();
    return this.vendorCustomers().filter(
      (c) =>
        !q ||
        c.customerName.toLowerCase().includes(q) ||
        c.customerEmail.toLowerCase().includes(q) ||
        c.customerPhone.toLowerCase().includes(q),
    );
  });

  readonly analyticsMetrics = computed(() => {
    const all = this.studioBookings();
    const valid = all.filter((b) => b.status !== 'Cancelled');
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const weekAgoIso = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const monthPrefix = todayIso.slice(0, 7);

    const dailyBookings = valid.filter((b) => b.date === todayIso).length;
    const weeklyBookings = valid.filter((b) => b.date >= weekAgoIso).length;
    const monthlyBookings = valid.filter((b) => b.createdAt.startsWith(monthPrefix) || b.date.startsWith(monthPrefix)).length;
    const monthlyRevenue = valid
      .filter((b) => b.createdAt.startsWith(monthPrefix) || b.date.startsWith(monthPrefix))
      .reduce((sum, b) => sum + b.amountPaid, 0);

    // Most booked services
    const srvCounts = new Map<string, { name: string; count: number; revenue: number }>();
    for (const b of valid) {
      const cur = srvCounts.get(b.serviceName) ?? { name: b.serviceName, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += b.servicePrice;
      srvCounts.set(b.serviceName, cur);
    }
    const topServices = Array.from(srvCounts.values()).sort((a, b) => b.count - a.count);

    // Customer retention & cancellation rate
    const customers = this.vendorCustomers();
    const repeatCustomers = customers.filter((c) => c.totalBookings > 1).length;
    const retentionRate =
      customers.length > 0 ? Math.round((repeatCustomers / customers.length) * 100) : 0;
    const cancellationRate =
      all.length > 0
        ? Math.round((all.filter((b) => b.status === 'Cancelled').length / all.length) * 100)
        : 0;

    return {
      dailyBookings,
      weeklyBookings,
      monthlyBookings,
      monthlyRevenue,
      topServices,
      retentionRate,
      repeatCustomers,
      totalCustomers: customers.length,
      cancellationRate,
    };
  });

  readonly galleryPresetOptions = [
    { label: 'Braids (Hair)', path: 'images/cat-hairdressers.jpg' },
    { label: 'Boho Knotless', path: 'images/hair-knotless-2.jpg' },
    { label: 'Skin Fade (Barber)', path: 'images/cat-barbers.jpg' },
    { label: 'Espresso Nails', path: 'images/cat-nails.jpg' },
    { label: 'Wispy Lashes', path: 'images/lashes-client-2.jpg' },
    { label: 'Soft Glam (MUA)', path: 'images/cat-makeup.jpg' },
    { label: 'Fine-Line Ink', path: 'images/cat-tattoo.jpg' },
    { label: 'Salon Interior', path: 'images/hero-salon.jpg' },
  ];

  get allSlotChoices(): string[] {
    return Array.from(
      new Set([...DEFAULT_TIME_SLOTS, ...(this.editAvailability?.enabledSlots || [])]),
    );
  }

  isCustomSlot(slot: string): boolean {
    return !DEFAULT_TIME_SLOTS.includes(slot);
  }

  constructor() {
    effect(() => {
      this.bookingSearch();
      this.bookingStatusFilter();
      this.selectedStudioSlug();
      this.bookingPage.set(1);
    });

    effect(() => {
      const studio = this.activeStudio();
      if (!studio) return;

      this.profileForm = {
        name: studio.name,
        tagline: studio.tagline,
        about: studio.about,
        city: studio.city,
        location: studio.location,
        address: studio.address,
        logoImage: studio.logoImage || '',
        coverImage: studio.coverImage,
        phone: studio.contact.phone,
        email: studio.contact.email,
        instagram: studio.contact.instagram,
        facebook: studio.contact.facebook || '',
        tiktok: studio.contact.tiktok || '',
        website: studio.contact.website || '',
      };

      this.editGallery = [...(studio.gallery || [])];
      this.editServices = studio.services.map((s) => ({
        ...s,
        isActive: s.isActive !== false,
      }));
      this.editStaff = studio.staff.map((m) => ({ ...m }));
      this.editHours = studio.workingHours.map((h) => ({ ...h }));
      const av = studio.availabilitySettings ?? DEFAULT_AVAILABILITY;
      this.editAvailability = {
        slotDurationMinutes: av.slotDurationMinutes || 60,
        bufferMinutes: av.bufferMinutes || 15,
        blockedDates: [...(av.blockedDates || [])],
        breaks: (av.breaks || []).map((br) => ({ ...br })),
        enabledSlots: [...(av.enabledSlots?.length ? av.enabledSlots : DEFAULT_TIME_SLOTS)],
      };
      this.editPolicy = { ...studio.paymentPolicy };
    });
  }

  get previewSlug(): string {
    return this.marketplace.slugify(this.customSlug || this.businessName || 'your-studio');
  }

  selectStudio(slug: string): void {
    this.selectedStudioSlug.set(slug);
    this.saveToast.set('');
  }

  // ==========================================================================
  // APPOINTMENT MANAGEMENT
  // ==========================================================================
  setStatus(ref: string, status: BookingStatus): void {
    this.marketplace.updateBookingStatus(ref, status);
    this.flashToast(`Appointment ${ref} marked ${status}.`);
  }

  markPaid(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Confirmed', 'Paid');
    this.flashToast(`Payment completed for ${ref}.`);
  }

  openReschedule(ref: string, currentDate: string, currentTime: string): void {
    this.reschedulingRef.set(ref);
    this.rescheduleDate = currentDate;
    this.rescheduleTime = currentTime;
  }

  confirmReschedule(ref: string): void {
    if (!this.rescheduleDate || !this.rescheduleTime) return;
    const d = new Date(`${this.rescheduleDate}T00:00:00`);
    const display = Number.isNaN(d.getTime())
      ? this.rescheduleDate
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    this.marketplace.rescheduleBooking(ref, this.rescheduleDate, display, this.rescheduleTime);
    this.reschedulingRef.set(null);
    this.flashToast(`Rescheduled ${ref} to ${display} at ${this.rescheduleTime}.`);
  }

  // ==========================================================================
  // BUSINESS PROFILE MANAGEMENT
  // ==========================================================================
  async onProfileLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.profileForm.logoImage = await this.marketplace.uploadStudioImage(file, 'logos');
  }

  async onProfileCoverSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.profileForm.coverImage = await this.marketplace.uploadStudioImage(file, 'covers');
  }

  async onProfileGallerySelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    this.uploadingGallery.set(true);
    try {
      for (const file of files) {
        const url = await this.marketplace.uploadStudioImage(file, 'gallery');
        this.editGallery = [...this.editGallery, url];
      }
      this.flashToast(
        `${files.length} portfolio ${files.length === 1 ? 'image' : 'images'} added. Click Save Business Profile to publish.`,
      );
    } finally {
      this.uploadingGallery.set(false);
      input.value = '';
    }
  }

  removeProfileGalleryImage(index: number): void {
    this.editGallery = this.editGallery.filter((_, i) => i !== index);
  }

  saveBusinessProfile(): void {
    const studio = this.activeStudio();
    if (!studio) return;
    const contact: BusinessContact = {
      phone: this.profileForm.phone.trim(),
      email: this.profileForm.email.trim(),
      instagram: this.profileForm.instagram.trim(),
      facebook: this.profileForm.facebook.trim() || undefined,
      tiktok: this.profileForm.tiktok.trim() || undefined,
      website: this.profileForm.website.trim() || undefined,
    };

    this.marketplace.updateStudioConfiguration(studio.slug, {
      name: this.profileForm.name.trim() || studio.name,
      tagline: this.profileForm.tagline.trim(),
      about: this.profileForm.about.trim(),
      city: this.profileForm.city.trim() || studio.city,
      location: this.profileForm.location.trim() || studio.location,
      address: this.profileForm.address.trim() || studio.address,
      logoImage: this.profileForm.logoImage.trim() || undefined,
      coverImage: this.profileForm.coverImage.trim() || studio.coverImage,
      gallery: [...this.editGallery],
      workingHours: this.editHours.map((h) => ({ ...h })),
      contact,
    });
    this.flashToast(`Saved business profile & portfolio for ${this.profileForm.name}.`);
  }

  // ==========================================================================
  // SERVICE & TEAM MANAGEMENT
  // ==========================================================================
  private createEmptyServiceDraft(): ServiceItem {
    return {
      id: `srv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: '',
      categoryLabel: 'Service',
      price: 15000,
      durationMinutes: 60,
      description: '',
      imageUrl: '',
      isActive: true,
    };
  }

  private createEmptyStaffDraft(): StaffMember {
    return {
      id: `stf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: '',
      role: 'Specialist',
      specialty: 'Studio Craft',
      avatarColor: '#92745b',
    };
  }

  openAddServiceModal(): void {
    this.editingServiceId.set(null);
    this.serviceModalError.set('');
    this.serviceDraft = this.createEmptyServiceDraft();
    this.serviceModalOpen.set(true);
  }

  openEditServiceModal(srv: ServiceItem): void {
    this.editingServiceId.set(srv.id);
    this.serviceModalError.set('');
    this.serviceDraft = {
      ...srv,
      isActive: srv.isActive !== false,
    };
    this.serviceModalOpen.set(true);
  }

  closeServiceModal(): void {
    this.serviceModalOpen.set(false);
    this.serviceModalError.set('');
  }

  async onDraftServiceImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.serviceDraft.imageUrl = await this.marketplace.uploadStudioImage(file, 'services');
  }

  saveServiceModal(): void {
    const name = this.serviceDraft.name.trim();
    const price = Number(this.serviceDraft.price);
    const durationMinutes = Number(this.serviceDraft.durationMinutes) || 60;
    if (!name || Number.isNaN(price) || price <= 0) {
      this.serviceModalError.set('Enter a valid service name and Naira price.');
      return;
    }

    const normalized: ServiceItem = {
      ...this.serviceDraft,
      name,
      categoryLabel: this.serviceDraft.categoryLabel.trim() || 'Service',
      price,
      durationMinutes,
      description: this.serviceDraft.description.trim() || 'Studio appointment with consultation.',
      imageUrl: this.serviceDraft.imageUrl?.trim() || undefined,
      isActive: this.serviceDraft.isActive !== false,
    };

    const editingId = this.editingServiceId();
    if (editingId) {
      this.editServices = this.editServices.map((s) => (s.id === editingId ? normalized : s));
    } else {
      this.editServices = [...this.editServices, normalized];
    }

    this.serviceModalOpen.set(false);
    this.persistMenuAndTeam(
      editingId ? `Updated service "${normalized.name}".` : `Added service "${normalized.name}".`,
    );
  }

  toggleServiceActive(srv: ServiceItem): void {
    const nextActive = srv.isActive === false;
    this.editServices = this.editServices.map((s) =>
      s.id === srv.id ? { ...s, isActive: nextActive } : s,
    );
    this.persistMenuAndTeam(
      `"${srv.name}" is now ${nextActive ? 'active on your storefront' : 'deactivated'}.`,
    );
  }

  removeEditService(index: number): void {
    if (this.editServices.length <= 1) return;
    const removed = this.editServices[index];
    this.editServices = this.editServices.filter((_, i) => i !== index);
    this.persistMenuAndTeam(`Deleted service "${removed?.name || 'Service'}".`);
  }

  openAddStaffModal(): void {
    this.editingStaffId.set(null);
    this.staffModalError.set('');
    this.staffDraft = this.createEmptyStaffDraft();
    this.staffModalOpen.set(true);
  }

  openEditStaffModal(member: StaffMember): void {
    this.editingStaffId.set(member.id);
    this.staffModalError.set('');
    this.staffDraft = { ...member };
    this.staffModalOpen.set(true);
  }

  closeStaffModal(): void {
    this.staffModalOpen.set(false);
    this.staffModalError.set('');
  }

  saveStaffModal(): void {
    const name = this.staffDraft.name.trim();
    if (!name) {
      this.staffModalError.set('Enter the specialist name.');
      return;
    }

    const normalized: StaffMember = {
      ...this.staffDraft,
      name,
      role: this.staffDraft.role.trim() || 'Specialist',
      specialty: this.staffDraft.specialty.trim() || 'Studio Craft',
    };

    const editingId = this.editingStaffId();
    if (editingId) {
      this.editStaff = this.editStaff.map((m) => (m.id === editingId ? normalized : m));
    } else {
      this.editStaff = [...this.editStaff, normalized];
    }

    this.staffModalOpen.set(false);
    this.persistMenuAndTeam(
      editingId ? `Updated specialist "${normalized.name}".` : `Added specialist "${normalized.name}".`,
    );
  }

  removeEditStaff(index: number): void {
    const removed = this.editStaff[index];
    this.editStaff = this.editStaff.filter((_, i) => i !== index);
    this.persistMenuAndTeam(`Removed specialist "${removed?.name || 'Team member'}".`);
  }

  saveMenuAndTeam(): void {
    this.persistMenuAndTeam();
  }

  private persistMenuAndTeam(customToast?: string): void {
    const studio = this.activeStudio();
    if (!studio) return;
    const validServices = this.editServices
      .filter((s) => s.name.trim() && s.price > 0)
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        categoryLabel: s.categoryLabel.trim() || 'Service',
        description: s.description.trim() || 'Studio appointment with consultation.',
        isActive: s.isActive !== false,
      }));
    if (validServices.length === 0) return;

    this.marketplace.updateStudioConfiguration(studio.slug, {
      services: validServices,
      staff: this.editStaff.filter((m) => m.name.trim()),
    });
    this.flashToast(
      customToast || `Saved service menu & team changes to /business/${studio.slug}`,
    );
  }

  // ==========================================================================
  // AVAILABILITY & PAYSTACK RULES
  // ==========================================================================
  toggleSlot(slot: string): void {
    const idx = this.editAvailability.enabledSlots.indexOf(slot);
    if (idx >= 0) {
      this.editAvailability.enabledSlots.splice(idx, 1);
    } else {
      this.editAvailability.enabledSlots.push(slot);
    }
  }

  addCustomSlot(): void {
    const raw = this.newCustomSlot.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!raw) {
      this.flashToast('Enter a time slot first (e.g. 07:00 PM).');
      return;
    }
    if (!this.editAvailability.enabledSlots.includes(raw)) {
      this.editAvailability.enabledSlots = [...this.editAvailability.enabledSlots, raw];
    }
    this.newCustomSlot = '';
    this.flashToast(`Added slot "${raw}". Click "Save Availability, Hours & Payment Rules" to publish.`);
  }

  removeCustomSlot(slot: string, event: Event): void {
    event.stopPropagation();
    this.editAvailability.enabledSlots = this.editAvailability.enabledSlots.filter((s) => s !== slot);
  }

  addBlockedDate(): void {
    if (!this.newBlockedDate) return;
    if (!this.editAvailability.blockedDates.includes(this.newBlockedDate)) {
      this.editAvailability.blockedDates.push(this.newBlockedDate);
      this.editAvailability.blockedDates.sort();
    }
    this.newBlockedDate = '';
  }

  removeBlockedDate(dateIso: string): void {
    this.editAvailability.blockedDates = this.editAvailability.blockedDates.filter(
      (d) => d !== dateIso,
    );
  }

  addBreakWindow(): void {
    if (!this.newBreak.start || !this.newBreak.end) return;
    this.editAvailability.breaks.push({
      id: `brk-${Date.now()}`,
      day: this.newBreak.day,
      start: this.newBreak.start,
      end: this.newBreak.end,
      label: this.newBreak.label.trim() || 'Studio Break',
    });
  }

  removeBreakWindow(id: string): void {
    this.editAvailability.breaks = this.editAvailability.breaks.filter((b) => b.id !== id);
  }

  saveHoursAndPolicy(): void {
    const studio = this.activeStudio();
    if (!studio) return;
    this.marketplace.updateStudioConfiguration(studio.slug, {
      workingHours: this.editHours.map((h) => ({ ...h })),
      availabilitySettings: {
        ...this.editAvailability,
        slotDurationMinutes: Number(this.editAvailability.slotDurationMinutes) || 60,
        bufferMinutes: Number(this.editAvailability.bufferMinutes) || 15,
      },
      paymentPolicy: {
        allowFull: true,
        allowDeposit: false,
        depositPercent: 0,
        allowPayAtBusiness: false,
      },
    });
    this.flashToast(`Saved availability, breaks, hours & Paystack rules for ${studio.name}`);
  }

  // ==========================================================================
  // NEW STUDIO WEBSITE BUILDER
  // ==========================================================================
  onCategoryChange(slug: CategorySlug): void {
    this.categorySlug = slug;
    const cat = this.marketplace.getCategoryBySlug(slug);
    if (cat) {
      this.coverImage = cat.coverImage;
    }
  }

  addService(): void {
    this.services.push({
      id: `srv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: '',
      categoryLabel: 'Service',
      price: 15000,
      durationMinutes: 60,
      description: '',
      isActive: true,
    });
  }

  removeService(index: number): void {
    if (this.services.length > 1) {
      this.services.splice(index, 1);
    }
  }

  addStaff(): void {
    this.staff.push({
      id: `stf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: '',
      role: 'Specialist',
      specialty: 'Client Care',
      avatarColor: '#735a45',
    });
  }

  removeStaff(index: number): void {
    this.staff.splice(index, 1);
  }

  async onCoverFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const url = await this.marketplace.uploadStudioImage(file, 'covers');
    this.coverImage = url;
  }

  async onBuilderGallerySelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    this.uploadingGallery.set(true);
    try {
      for (const file of files) {
        const url = await this.marketplace.uploadStudioImage(file, 'gallery');
        this.galleryImages = [...this.galleryImages, url];
      }
    } finally {
      this.uploadingGallery.set(false);
      input.value = '';
    }
  }

  removeBuilderGalleryImage(index: number): void {
    this.galleryImages = this.galleryImages.filter((_, i) => i !== index);
  }

  loadDemoPreset(): void {
    this.businessName = 'Aurelia Hair & Scalp Spa';
    this.customSlug = 'aurelia-hair-spa';
    this.categorySlug = 'hairdressers';
    this.tagline = 'Botanical scalp rituals, boho braids & silk press in Lekki.';
    this.about =
      'Aurelia Hair & Scalp Spa blends trichology with tension-free protective styling in Lekki Phase 1. Private chairs, steam hydration, and clear pricing.';
    this.city = 'Lagos';
    this.location = 'Lekki Phase 1, Lagos';
    this.address = '22 Admiralty Road, Lekki Phase 1, Lagos';
    this.phone = '+234 809 555 2180';
    this.email = 'hello@aureliaspa.ng';
    this.instagram = '@aureliahairspa';
    this.coverImage = 'images/hair-knotless-2.jpg';
    this.galleryImages = [];
    this.services = [
      {
        id: 'srv-au-1',
        name: 'Boho Knotless Braids',
        categoryLabel: 'Braids',
        price: 30000,
        durationMinutes: 180,
        description: 'Soft human-hair curls blended into featherlight knotless braids.',
        isActive: true,
      },
      {
        id: 'srv-au-2',
        name: 'Botanical Scalp Detox',
        categoryLabel: 'Scalp Spa',
        price: 14000,
        durationMinutes: 60,
        description: 'Micro-mist steam cleanse, rosemary oil massage, and deep mask.',
        isActive: true,
      },
    ];
    this.staff = [
      {
        id: 'stf-au-1',
        name: 'Yewande Ajayi',
        role: 'Lead Stylist',
        specialty: 'Boho Braids & Scalp Spa',
        avatarColor: '#92745b',
      },
    ];
  }

  publishStudio(): void {
    this.formError.set('');
    if (!this.businessName.trim() || !this.location.trim()) {
      this.formError.set('Please enter your Business Name and Area / Location.');
      return;
    }

    const validServices = this.services.filter((s) => s.name.trim() && s.price > 0);
    if (validServices.length === 0) {
      this.formError.set('Please add at least one service with a name and valid Naira price.');
      return;
    }

    const slug = this.previewSlug || `studio-${Date.now()}`;
    const cat = this.marketplace.getCategoryBySlug(this.categorySlug);
    const words = this.businessName.trim().split(/\s+/);
    const logoText =
      words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : this.businessName.trim().slice(0, 2).toUpperCase();

    const saved = this.marketplace.upsertBusiness({
      slug,
      name: this.businessName.trim(),
      categorySlug: this.categorySlug,
      categoryLabel: cat?.name ?? 'Beauty Studio',
      tagline: this.tagline.trim() || 'Curated beauty & personal care studio.',
      about:
        this.about.trim() ||
        `${this.businessName.trim()} is a verified studio on Beautiva delivering bespoke beauty services.`,
      location: this.location.trim(),
      city: this.city.trim() || 'Lagos',
      address: this.address.trim() || this.location.trim(),
      logoText,
      logoBg: '#302c28',
      coverImage: this.coverImage,
      gallery: this.galleryImages.filter(Boolean),
      featured: true,
      status: 'active',
      services: validServices.map((s) => ({
        ...s,
        name: s.name.trim(),
        description: s.description.trim() || 'Professional studio appointment.',
        isActive: true,
      })),
      staff: this.staff.filter((m) => m.name.trim()),
      workingHours: DEFAULT_WORKING_HOURS,
      contact: {
        phone: this.phone.trim() || '+234 800 000 0000',
        email: this.email.trim() || `hello@${slug}.ng`,
        instagram: this.instagram.trim() || `@${slug}`,
      },
      paymentPolicy: {
        allowFull: true,
        allowDeposit: false,
        depositPercent: 0,
        allowPayAtBusiness: false,
      },
    });

    this.publishedSlug.set(saved.slug);
    this.selectedStudioSlug.set(saved.slug);
  }

  private flashToast(msg: string): void {
    this.saveToast.set(msg);
    setTimeout(() => {
      if (this.saveToast() === msg) this.saveToast.set('');
    }, 3500);
  }
}
