import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DEFAULT_WORKING_HOURS } from '../../data/seed-data';
import {
  BookingStatus,
  CategorySlug,
  PaymentPolicy,
  ServiceItem,
  StaffMember,
  WorkingHours,
} from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-vendor-studio',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './vendor-studio.component.html',
  styleUrl: './vendor-studio.component.css',
})
export class VendorStudioComponent {
  readonly marketplace = inject(MarketplaceService);
  readonly categories = this.marketplace.categories;
  readonly businesses = this.marketplace.businesses;
  readonly bookings = this.marketplace.bookings;

  readonly activeTab = signal<'bookings' | 'menu' | 'hours' | 'builder'>('bookings');
  readonly selectedStudioSlug = signal<string>('glamour-studio');
  readonly bookingStatusFilter = signal<'all' | BookingStatus>('all');
  readonly bookingSearch = signal('');
  readonly saveToast = signal('');

  // Editable copies for active studio (Services, Team, Hours, Payment Policy)
  editServices: ServiceItem[] = [];
  editStaff: StaffMember[] = [];
  editHours: WorkingHours[] = [];
  editPolicy: PaymentPolicy = {
    allowFull: true,
    allowDeposit: true,
    depositPercent: 30,
    allowPayAtBusiness: true,
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
  galleryImages: string[] = ['images/cat-hairdressers.jpg', 'images/hero-salon.jpg'];

  allowFull = true;
  allowDeposit = true;
  depositPercent = 30;
  allowPayAtBusiness = true;

  services: ServiceItem[] = [
    {
      id: `srv-custom-${Date.now()}`,
      name: 'Signature Session',
      categoryLabel: 'Signature',
      price: 20000,
      durationMinutes: 90,
      description: 'Personalized luxury treatment with consultation included.',
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

  readonly activeStudio = computed(() => {
    return (
      this.marketplace.getBusinessBySlug(this.selectedStudioSlug()) ?? this.businesses()[0]
    );
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
        b.serviceName.toLowerCase().includes(q)
      );
    });
  });

  readonly studioMetrics = computed(() => {
    const list = this.studioBookings().filter((b) => b.status !== 'Cancelled');
    const collected = list.reduce((sum, b) => sum + b.amountPaid, 0);
    const pendingBalance = list.reduce((sum, b) => sum + b.balanceDue, 0);
    const activeCount = list.filter(
      (b) => b.status === 'Confirmed' || b.status === 'Pending',
    ).length;
    const completedCount = list.filter((b) => b.status === 'Completed').length;
    return {
      collected,
      pendingBalance,
      totalCount: this.studioBookings().length,
      activeCount,
      completedCount,
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

  constructor() {
    effect(() => {
      const studio = this.activeStudio();
      if (!studio) return;
      this.editServices = studio.services.map((s) => ({ ...s }));
      this.editStaff = studio.staff.map((m) => ({ ...m }));
      this.editHours = studio.workingHours.map((h) => ({ ...h }));
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

  setStatus(ref: string, status: BookingStatus): void {
    this.marketplace.updateBookingStatus(ref, status);
  }

  markPaid(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Confirmed', 'Paid');
  }

  addEditService(): void {
    this.editServices.push({
      id: `srv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: '',
      categoryLabel: 'Service',
      price: 15000,
      durationMinutes: 60,
      description: '',
    });
  }

  removeEditService(index: number): void {
    if (this.editServices.length > 1) {
      this.editServices.splice(index, 1);
    }
  }

  addEditStaff(): void {
    this.editStaff.push({
      id: `stf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: '',
      role: 'Specialist',
      specialty: 'Studio Craft',
      avatarColor: '#92745b',
    });
  }

  removeEditStaff(index: number): void {
    this.editStaff.splice(index, 1);
  }

  saveMenuAndTeam(): void {
    const studio = this.activeStudio();
    if (!studio) return;
    const validServices = this.editServices
      .filter((s) => s.name.trim() && s.price > 0)
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        categoryLabel: s.categoryLabel.trim() || 'Service',
        description: s.description.trim() || 'Studio appointment with consultation.',
      }));
    if (validServices.length === 0) return;

    this.marketplace.updateStudioConfiguration(studio.slug, {
      services: validServices,
      staff: this.editStaff.filter((m) => m.name.trim()),
    });
    this.flashToast(`Saved menu & team changes to /business/${studio.slug}`);
  }

  saveHoursAndPolicy(): void {
    const studio = this.activeStudio();
    if (!studio) return;
    this.marketplace.updateStudioConfiguration(studio.slug, {
      workingHours: this.editHours.map((h) => ({ ...h })),
      paymentPolicy: {
        ...this.editPolicy,
        depositPercent: Number(this.editPolicy.depositPercent) || 30,
      },
    });
    this.flashToast(`Updated hours & Paystack rules for ${studio.name}`);
  }

  onCategoryChange(slug: CategorySlug): void {
    this.categorySlug = slug;
    const cat = this.marketplace.getCategoryBySlug(slug);
    if (cat) {
      this.coverImage = cat.coverImage;
      if (!this.galleryImages.includes(cat.coverImage)) {
        this.galleryImages = [cat.coverImage, 'images/hero-salon.jpg'];
      }
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

  onCoverFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.coverImage = reader.result;
        this.galleryImages = [reader.result, ...this.galleryImages.slice(0, 3)];
      }
    };
    reader.readAsDataURL(file);
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
    this.galleryImages = ['images/hair-knotless-2.jpg', 'images/hero-salon.jpg'];
    this.services = [
      {
        id: 'srv-au-1',
        name: 'Boho Knotless Braids',
        categoryLabel: 'Braids',
        price: 30000,
        durationMinutes: 180,
        description: 'Soft human-hair curls blended into featherlight knotless braids.',
      },
      {
        id: 'srv-au-2',
        name: 'Botanical Scalp Detox',
        categoryLabel: 'Scalp Spa',
        price: 14000,
        durationMinutes: 60,
        description: 'Micro-mist steam cleanse, rosemary oil massage, and deep mask.',
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
      gallery: this.galleryImages.length ? this.galleryImages : [this.coverImage],
      featured: true,
      status: 'active',
      services: validServices.map((s) => ({
        ...s,
        name: s.name.trim(),
        description: s.description.trim() || 'Professional studio appointment.',
      })),
      staff: this.staff.filter((m) => m.name.trim()),
      workingHours: DEFAULT_WORKING_HOURS,
      contact: {
        phone: this.phone.trim() || '+234 800 000 0000',
        email: this.email.trim() || `hello@${slug}.ng`,
        instagram: this.instagram.trim() || `@${slug}`,
      },
      paymentPolicy: {
        allowFull: this.allowFull,
        allowDeposit: this.allowDeposit,
        depositPercent: Number(this.depositPercent) || 30,
        allowPayAtBusiness: this.allowPayAtBusiness,
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
