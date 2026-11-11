import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DEFAULT_WORKING_HOURS } from '../../data/seed-data';
import {
  BookingStatus,
  CategorySlug,
  ServiceItem,
  StaffMember,
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

  readonly activeTab = signal<'builder' | 'bookings'>('builder');
  readonly publishedSlug = signal<string | null>(null);
  readonly formError = signal('');

  // Studio Builder Form Fields
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
      avatarColor: '#a67c52',
    },
  ];

  // Filter for bookings tab
  readonly bookingsFilterSlug = signal<string>('all');

  readonly filteredBookings = computed(() => {
    const f = this.bookingsFilterSlug();
    if (f === 'all') return this.bookings();
    return this.bookings().filter((b) => b.businessSlug === f);
  });

  get previewSlug(): string {
    return this.marketplace.slugify(this.customSlug || this.businessName || 'your-studio');
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
      avatarColor: '#624834',
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
    this.tagline = 'Luxury botanical scalp rituals, boho braids & sleek press.';
    this.about =
      'Aurelia Hair & Scalp Spa blends holistic trichology with modern protective styling in Lekki. Enjoy private suites, organic oils, and transparent pricing.';
    this.city = 'Lagos';
    this.location = 'Lekki Phase 1, Lagos';
    this.address = '22 Admiralty Road, Lekki Phase 1, Lagos';
    this.phone = '+234 809 555 2180';
    this.email = 'hello@aureliaspa.ng';
    this.instagram = '@aureliahairspa';
    this.coverImage = 'images/cat-hairdressers.jpg';
    this.galleryImages = ['images/cat-hairdressers.jpg', 'images/hero-salon.jpg'];
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
        avatarColor: '#a67c52',
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
      logoBg: '#2b2119',
      coverImage: this.coverImage,
      gallery: this.galleryImages.length ? this.galleryImages : [this.coverImage],
      featured: true,
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
  }

  setStatus(ref: string, status: BookingStatus): void {
    this.marketplace.updateBookingStatus(ref, status);
  }

  markPaid(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Confirmed', 'Paid');
  }
}

