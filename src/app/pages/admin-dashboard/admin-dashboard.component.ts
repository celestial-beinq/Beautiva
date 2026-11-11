import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BookingStatus,
  CategorySlug,
  StudioStatus,
} from '../../models/marketplace.models';
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
  readonly categories = this.marketplace.categories;
  readonly businesses = this.marketplace.businesses;
  readonly bookings = this.marketplace.bookings;

  readonly activeTab = signal<'overview' | 'studios' | 'ledger' | 'reviews'>('overview');

  // Studio filters
  readonly studioSearch = signal('');
  readonly studioCategoryFilter = signal<CategorySlug | 'all'>('all');
  readonly studioStatusFilter = signal<'all' | StudioStatus>('all');

  // Ledger filters
  readonly ledgerSearch = signal('');
  readonly ledgerStatusFilter = signal<'all' | BookingStatus>('all');

  readonly platformMetrics = computed(() => {
    const allBiz = this.businesses();
    const activeStudios = allBiz.filter((b) => (b.status ?? 'active') === 'active').length;
    const suspendedStudios = allBiz.filter((b) => b.status === 'suspended').length;
    const verifiedStudios = allBiz.filter((b) => b.verified).length;
    const featuredStudios = allBiz.filter((b) => b.featured).length;

    const allBookings = this.bookings();
    const validBookings = allBookings.filter((b) => b.status !== 'Cancelled');
    const grossBookingValue = validBookings.reduce((s, b) => s + b.servicePrice, 0);
    const paystackCollected = validBookings.reduce((s, b) => s + b.amountPaid, 0);
    const balanceAtStudios = validBookings.reduce((s, b) => s + b.balanceDue, 0);
    const platformCommission = Math.round(paystackCollected * 0.1);

    const fullCount = validBookings.filter((b) => b.paymentOption === 'full').length;
    const depositCount = validBookings.filter((b) => b.paymentOption === 'deposit').length;
    const venueCount = validBookings.filter((b) => b.paymentOption === 'pay-at-business').length;

    return {
      totalStudios: allBiz.length,
      activeStudios,
      suspendedStudios,
      verifiedStudios,
      featuredStudios,
      totalBookings: allBookings.length,
      validBookingsCount: validBookings.length,
      grossBookingValue,
      paystackCollected,
      balanceAtStudios,
      platformCommission,
      fullCount,
      depositCount,
      venueCount,
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
    return rows.map((r) => ({
      ...r,
      barWidthPct: Math.max(r.studioCount > 0 ? 12 : 0, Math.round((r.volume / maxVol) * 100)),
    }));
  });

  readonly cityBreakdown = computed(() => {
    const map = new Map<string, number>();
    for (const biz of this.businesses()) {
      map.set(biz.city, (map.get(biz.city) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([city, count]) => ({ city, count }));
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
        biz.slug.toLowerCase().includes(q)
      );
    });
  });

  readonly filteredLedger = computed(() => {
    const q = this.ledgerSearch().trim().toLowerCase();
    const st = this.ledgerStatusFilter();

    return this.bookings().filter((b) => {
      if (st !== 'all' && b.status !== st) return false;
      if (!q) return true;
      return (
        b.bookingReference.toLowerCase().includes(q) ||
        b.businessName.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        (b.paystackReference ?? '').toLowerCase().includes(q)
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
    }> = [];
    for (const biz of this.businesses()) {
      for (const rev of biz.reviews) {
        list.push({
          ...rev,
          businessSlug: biz.slug,
          businessName: biz.name,
        });
      }
    }
    return list;
  });

  toggleVerified(slug: string): void {
    this.marketplace.toggleBusinessVerified(slug);
  }

  toggleFeatured(slug: string): void {
    this.marketplace.toggleBusinessFeatured(slug);
  }

  toggleSuspend(slug: string, currentStatus?: StudioStatus): void {
    const next: StudioStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    this.marketplace.setBusinessStatus(slug, next);
  }

  setBookingStatus(ref: string, status: BookingStatus): void {
    this.marketplace.updateBookingStatus(ref, status);
  }

  markBookingPaid(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Confirmed', 'Paid');
  }

  removeReview(businessSlug: string, reviewId: string): void {
    this.marketplace.deleteReview(businessSlug, reviewId);
  }
}

