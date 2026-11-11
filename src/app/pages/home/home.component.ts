import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BusinessCardComponent } from '../../components/business-card/business-card.component';
import { CategorySlug } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

interface ServiceMenuGroup {
  id: string;
  num: string;
  label: string;
  categories: CategorySlug[];
  tagline: string;
}

interface LookbookItem {
  image: string;
  title: string;
  studioName: string;
  studioSlug: string;
  priceLabel: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, FormsModule, BusinessCardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly marketplace = inject(MarketplaceService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly heroSlides = [
    { src: 'images/hero-salon.jpg', alt: 'Nigerian hair salon with arched LED mirrors' },
    { src: 'images/hero-pedicure.jpg', alt: 'Nigerian nail and pedicure studio lounge' },
    { src: 'images/hero-barber-studio.jpg', alt: 'Nigerian barbershop and grooming studio' },
  ];
  readonly activeHeroSlide = signal(0);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const id = window.setInterval(() => {
        this.activeHeroSlide.update((i) => (i + 1) % this.heroSlides.length);
      }, 5500);
      this.destroyRef.onDestroy(() => window.clearInterval(id));
    }
  }

  readonly categories = this.marketplace.categories;
  readonly featuredBusinesses = computed(() => this.marketplace.featuredBusinesses().slice(0, 6));
  readonly reviews = this.marketplace.recentTestimonials;

  readonly searchQuery = signal('');
  readonly selectedCategory = signal<CategorySlug | 'all'>('all');
  readonly activeCategoryIndex = signal(0);
  readonly activeMenuGroupIndex = signal(0);
  readonly activeShowcaseSlug = signal('glamour-studio');
  readonly activeReviewIndex = signal(0);
  readonly openFaqIndex = signal<number | null>(0);
  readonly quickTrackRef = signal('BK-2026-000124');

  readonly marqueeItems = [
    'Knotless Braids',
    'Skin Fades & Beard Sculpts',
    'BIAB Natural Nails',
    'Wispy Volume Lashes',
    'Bridal & Soft Glam',
    'Fine-Line Tattoos',
    'HD Lace Melts',
    'Silk Press',
  ];

  readonly menuGroups: ServiceMenuGroup[] = [
    {
      id: 'hair',
      num: '01',
      label: 'Hair & Braiding',
      categories: ['hairdressers'],
      tagline: 'Tension-free protective styles, HD lace installations, and healthy hair care.',
    },
    {
      id: 'barbers',
      num: '02',
      label: 'Cuts & Fades',
      categories: ['barbers'],
      tagline: 'Clipper fades blended by hand, beard line-ups, locs retwists, and steam rituals.',
    },
    {
      id: 'nails-lashes',
      num: '03',
      label: 'Nails & Lashes',
      categories: ['nail-technicians', 'lash-technicians'],
      tagline: 'Strengthening BIAB overlays, sculpted extensions, wispy lash mapping, and brows.',
    },
    {
      id: 'makeup-ink',
      num: '04',
      label: 'Makeup & Ink',
      categories: ['makeup-artists', 'tattoo-artists'],
      tagline: 'Skin-first Nigerian bridal glam, event beats, and sterile fine-line tattoo art.',
    },
  ];

  readonly lookbookItems: LookbookItem[] = [
    {
      image: 'images/hair-knotless-2.jpg',
      title: 'Boho Knotless Braids',
      studioName: 'Glamour Studio · Lekki',
      studioSlug: 'glamour-studio',
      priceLabel: 'from ₦25,000',
    },
    {
      image: 'images/barber-fade-2.jpg',
      title: 'Razor Skin Fade',
      studioName: 'Scissor Grooming Club · Ikoyi',
      studioSlug: 'scissor-grooming-club',
      priceLabel: 'from ₦8,500',
    },
    {
      image: 'images/cat-nails.jpg',
      title: 'Espresso BIAB Set',
      studioName: 'Nude Nail Atelier · Ikeja GRA',
      studioSlug: 'nude-nail-atelier',
      priceLabel: 'from ₦12,000',
    },
    {
      image: 'images/makeup-bridal.jpg',
      title: 'Nigerian Bridal Glam',
      studioName: 'Lumiere Faces Studio · VI',
      studioSlug: 'lumiere-faces-studio',
      priceLabel: 'from ₦65,000',
    },
    {
      image: 'images/cat-lashes.jpg',
      title: 'Hybrid Wispy Lashes',
      studioName: 'Wink Lash Sanctuary · Lekki',
      studioSlug: 'wink-lash-sanctuary',
      priceLabel: 'from ₦18,000',
    },
    {
      image: 'images/cat-tattoo.jpg',
      title: 'Botanical Fine-Line Piece',
      studioName: 'Kuro Fine-Line Studio · Yaba',
      studioSlug: 'kuro-fineline-ink',
      priceLabel: 'from ₦40,000',
    },
    {
      image: 'images/hair-knotless-3.jpg',
      title: 'Waist-Length Knotless',
      studioName: 'Glamour Studio · Lekki',
      studioSlug: 'glamour-studio',
      priceLabel: 'from ₦25,000',
    },
    {
      image: 'images/barber-fade-3.jpg',
      title: 'Taper & Beard Sculpt',
      studioName: 'Maison Blade Lounge · Abuja',
      studioSlug: 'maison-blade-abuja',
      priceLabel: 'from ₦15,000',
    },
  ];

  readonly faqs: FaqItem[] = [
    {
      question: 'How does every vendor get their own website?',
      answer:
        'When a studio joins Beautiva via the Vendor Builder, we automatically generate a live storefront at beautiva.ng/business/their-studio with their about section, full Naira service menu, staff list, work gallery, hours, and booking checkout.',
    },
    {
      question: 'What Paystack payment options are supported?',
      answer:
        'You can pay 100% upfront via Paystack (Card, Bank Transfer, or USSD), lock your slot with a 30% deposit and pay the balance at the studio, or choose Pay at Business when a studio enables walk-in settlement.',
    },
    {
      question: 'How do I track my appointment after booking?',
      answer:
        'Every confirmed booking issues a unique reference like BK-2026-000124 in your confirmation view and email preview. Enter that ID anytime on the Track Booking page to see live payment and appointment status.',
    },
    {
      question: 'Can I pick a specific stylist, barber, or artist?',
      answer:
        'Yes. During step 4 of booking, you can select any available specialist from the studio’s team or leave it on "No preference" for the fastest open chair.',
    },
    {
      question: 'What happens if I need to cancel or reschedule?',
      answer:
        'Open your booking on the Track Booking page using your BK-2026 reference ID. If you need to release the time slot, you can cancel directly from the status view.',
    },
  ];

  readonly categoryCountMap = computed(() => {
    const map = new Map<CategorySlug, number>();
    for (const biz of this.marketplace.businesses()) {
      map.set(biz.categorySlug, (map.get(biz.categorySlug) ?? 0) + 1);
    }
    return map;
  });

  readonly activeCategory = computed(() => {
    const list = this.categories();
    return list[this.activeCategoryIndex()] ?? list[0];
  });

  readonly activeMenuGroup = computed(() => {
    return this.menuGroups[this.activeMenuGroupIndex()] ?? this.menuGroups[0];
  });

  readonly activeMenuServices = computed(() => {
    const cats = new Set(this.activeMenuGroup().categories);
    const rows: {
      businessSlug: string;
      businessName: string;
      location: string;
      serviceId: string;
      name: string;
      description: string;
      price: number;
      durationMinutes: number;
    }[] = [];

    for (const biz of this.marketplace.businesses()) {
      if (!cats.has(biz.categorySlug)) continue;
      for (const srv of biz.services) {
        rows.push({
          businessSlug: biz.slug,
          businessName: biz.name,
          location: biz.location,
          serviceId: srv.id,
          name: srv.name,
          description: srv.description,
          price: srv.price,
          durationMinutes: srv.durationMinutes,
        });
      }
    }
    return rows.slice(0, 6);
  });

  readonly showcaseStudios = computed(() => {
    const slugs = [
      'glamour-studio',
      'scissor-grooming-club',
      'nude-nail-atelier',
      'lumiere-faces-studio',
    ];
    return slugs
      .map((s) => this.marketplace.getBusinessBySlug(s))
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
  });

  readonly activeShowcaseStudio = computed(() => {
    return (
      this.marketplace.getBusinessBySlug(this.activeShowcaseSlug()) ??
      this.showcaseStudios()[0] ??
      this.marketplace.businesses()[0]
    );
  });

  readonly activeReview = computed(() => {
    const list = this.reviews();
    return list[this.activeReviewIndex()] ?? list[0];
  });

  submitSearch(): void {
    const q = this.searchQuery().trim();
    const cat = this.selectedCategory();
    if (cat !== 'all' && !q) {
      this.router.navigate(['/category', cat]);
      return;
    }
    this.router.navigate(['/businesses'], {
      queryParams: {
        q: q || null,
        category: cat !== 'all' ? cat : null,
      },
    });
  }

  submitQuickTrack(): void {
    const ref = this.quickTrackRef().trim();
    this.router.navigate(['/track'], {
      queryParams: ref ? { ref } : undefined,
    });
  }

  toggleFaq(index: number): void {
    this.openFaqIndex.update((curr) => (curr === index ? null : index));
  }
}
