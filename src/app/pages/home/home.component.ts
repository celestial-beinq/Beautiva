import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BusinessCardComponent } from '../../components/business-card/business-card.component';
import { CategorySlug } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

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

  readonly categories = this.marketplace.categories;
  readonly featuredBusinesses = computed(() => this.marketplace.featuredBusinesses().slice(0, 6));
  readonly reviews = this.marketplace.recentTestimonials;

  readonly searchQuery = signal('');
  readonly selectedCategory = signal<CategorySlug | 'all'>('all');
  readonly activeCategoryIndex = signal(0);
  readonly openFaqIndex = signal<number | null>(0);
  readonly quickTrackRef = signal('BK-2026-000124');

  readonly heroColumns = [
    {
      image: 'images/hero-salon.jpg',
      label: 'CRAFT',
      alt: 'Nigerian salon interior with arched mirrors',
      route: '/category/hairdressers',
    },
    {
      image: 'images/cat-hairdressers.jpg',
      label: 'STUDIO',
      alt: 'Nigerian stitch braids and curly ends',
      route: '/business/glamour-studio',
    },
    {
      image: 'images/cat-makeup.jpg',
      label: 'ARTISTRY',
      alt: 'Nigerian soft glam makeup artistry',
      route: '/category/makeup-artists',
    },
    {
      image: 'images/cat-barbers.jpg',
      label: 'RESULTS',
      alt: 'Precision skin fade and sculpted beard',
      route: '/category/barbers',
    },
  ];

  readonly faqs: FaqItem[] = [
    {
      question: 'HOW DO I BOOK AN APPOINTMENT?',
      answer:
        'Browse any of the 6 beauty categories, open a studio’s auto-generated website, pick your service, date, time, and optional specialist, then confirm with Paystack (full or 30% deposit) or pay at the studio.',
    },
    {
      question: 'HOW DOES EVERY VENDOR GET A WEBSITE AUTOMATICALLY?',
      answer:
        'When a studio submits its services, Naira prices, photos, and working hours in the Vendor Dashboard, Beautiva instantly generates a live storefront like beautiva.ng/business/glamour-studio.',
    },
    {
      question: 'WHAT PAYSTACK PAYMENT OPTIONS ARE SUPPORTED?',
      answer:
        'You can pay 100% online via Paystack (Card, Bank Transfer, or USSD), secure your slot with a 30% deposit, or choose Pay at Business when a studio enables walk-in settlement.',
    },
    {
      question: 'HOW DO I TRACK MY BOOKING AFTER PAYING?',
      answer:
        'Every confirmed booking issues a unique reference like BK-2026-000124 in your confirmation preview and email summary. Enter it on the Tracking page anytime for live status.',
    },
    {
      question: 'CAN I PICK A SPECIFIC STYLIST, BARBER, OR ARTIST?',
      answer:
        'Yes. During booking you can choose any specialist on the studio’s team or select "Any available specialist" for the earliest open chair.',
    },
    {
      question: 'WHAT HAPPENS IF I NEED TO CANCEL OR RESCHEDULE?',
      answer:
        'Open your booking on the Tracking page using your BK-2026 reference ID to cancel or contact our Lagos & Abuja concierge desk for fast rescheduling.',
    },
  ];

  readonly categoryPriceRanges = computed(() => {
    const map = new Map<CategorySlug, { min: number; max: number; count: number }>();
    for (const cat of this.categories()) {
      const studios = this.marketplace.getBusinessesByCategory(cat.slug);
      const prices = studios.flatMap((s) => s.services.map((srv) => srv.price));
      map.set(cat.slug, {
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
        count: studios.length,
      });
    }
    return map;
  });

  submitSearch(): void {
    const q = this.searchQuery().trim();
    const cat = this.selectedCategory();
    if (cat !== 'all' && !q) {
      this.router.navigate(['/category', cat]);
      return;
    }
    this.router.navigate(['/vendors'], {
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
