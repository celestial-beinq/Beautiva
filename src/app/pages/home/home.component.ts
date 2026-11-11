import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BusinessCardComponent } from '../../components/business-card/business-card.component';
import { CategorySlug } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

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
  readonly featuredBusinesses = this.marketplace.featuredBusinesses;
  readonly popularServices = this.marketplace.popularServices;
  readonly reviews = this.marketplace.recentTestimonials;

  readonly searchQuery = signal('');
  readonly selectedCategory = signal<CategorySlug | 'all'>('all');

  readonly categoryCountMap = computed(() => {
    const map = new Map<CategorySlug, number>();
    for (const biz of this.marketplace.businesses()) {
      map.set(biz.categorySlug, (map.get(biz.categorySlug) ?? 0) + 1);
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
    this.router.navigate(['/businesses'], {
      queryParams: {
        q: q || null,
        category: cat !== 'all' ? cat : null,
      },
    });
  }
}

