import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-business-site',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './business-site.component.html',
  styleUrl: './business-site.component.css',
})
export class BusinessSiteComponent {
  readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);

  readonly slug = signal<string>('');
  readonly business = computed(() => this.marketplace.getBusinessBySlug(this.slug()));
  readonly lightboxImage = signal<string | null>(null);

  // New review form state
  readonly showReviewForm = signal(false);
  reviewAuthor = '';
  reviewService = '';
  reviewRating = 5;
  reviewComment = '';
  readonly reviewSubmitted = signal(false);

  readonly startingPrice = computed(() => {
    const biz = this.business();
    return biz ? this.marketplace.formatNaira(this.marketplace.getStartingPrice(biz)) : '₦0';
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const s = params.get('slug');
      if (s) {
        this.slug.set(s);
        const biz = this.marketplace.getBusinessBySlug(s);
        if (biz && biz.services.length > 0) {
          this.reviewService = biz.services[0].name;
        }
      }
    });
  }

  openLightbox(img: string): void {
    this.lightboxImage.set(img);
  }

  closeLightbox(): void {
    this.lightboxImage.set(null);
  }

  submitReview(): void {
    const biz = this.business();
    if (!biz || !this.reviewAuthor.trim() || !this.reviewComment.trim()) return;
    this.marketplace.addReview(biz.slug, {
      author: this.reviewAuthor.trim(),
      rating: Number(this.reviewRating) || 5,
      serviceName: this.reviewService || biz.services[0]?.name || 'Service',
      comment: this.reviewComment.trim(),
    });
    this.reviewAuthor = '';
    this.reviewComment = '';
    this.reviewRating = 5;
    this.showReviewForm.set(false);
    this.reviewSubmitted.set(true);
    setTimeout(() => this.reviewSubmitted.set(false), 3500);
  }
}

