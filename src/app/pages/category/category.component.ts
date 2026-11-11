import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BusinessCardComponent } from '../../components/business-card/business-card.component';
import { CategorySlug } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [RouterLink, FormsModule, BusinessCardComponent],
  templateUrl: './category.component.html',
  styleUrl: './category.component.css',
})
export class CategoryComponent {
  readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly categories = this.marketplace.categories;
  readonly cities = computed(() => this.marketplace.getAvailableCities());

  readonly routeSlug = signal<CategorySlug | 'all'>('all');
  readonly searchQuery = signal('');
  readonly selectedCity = signal('all');
  readonly sortBy = signal<'rating' | 'price-asc' | 'reviews'>('rating');
  readonly onlyPayAtBusiness = signal(false);

  readonly activeCategory = computed(() => {
    const slug = this.routeSlug();
    return slug === 'all' ? undefined : this.marketplace.getCategoryBySlug(slug);
  });

  readonly filteredBusinesses = computed(() => {
    const list = this.marketplace.searchBusinesses(
      this.searchQuery(),
      this.routeSlug(),
      this.selectedCity(),
      this.onlyPayAtBusiness(),
    );
    const sort = this.sortBy();
    return [...list].sort((a, b) => {
      if (sort === 'price-asc') {
        return this.marketplace.getStartingPrice(a) - this.marketplace.getStartingPrice(b);
      }
      if (sort === 'reviews') {
        return b.reviewCount - a.reviewCount;
      }
      return b.rating - a.rating;
    });
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') as CategorySlug | null;
      this.routeSlug.set(slug ?? 'all');
    });

    this.route.queryParamMap.subscribe((qp) => {
      const q = qp.get('q');
      const cat = qp.get('category') as CategorySlug | null;
      if (q !== null) this.searchQuery.set(q);
      if (cat && !this.route.snapshot.paramMap.get('slug')) {
        this.routeSlug.set(cat);
      }
    });
  }

  switchCategory(slug: CategorySlug | 'all'): void {
    if (slug === 'all') {
      this.router.navigate(['/vendors']);
    } else {
      this.router.navigate(['/category', slug]);
    }
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCity.set('all');
    this.sortBy.set('rating');
    this.onlyPayAtBusiness.set(false);
  }
}

