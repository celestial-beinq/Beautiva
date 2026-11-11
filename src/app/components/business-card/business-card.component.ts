import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessProfile } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-business-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './business-card.component.html',
  styleUrl: './business-card.component.css',
})
export class BusinessCardComponent {
  private readonly marketplace = inject(MarketplaceService);
  readonly business = input.required<BusinessProfile>();

  readonly startingPrice = computed(() =>
    this.marketplace.formatNaira(this.marketplace.getStartingPrice(this.business())),
  );

  formatPrice(amount: number): string {
    return this.marketplace.formatNaira(amount);
  }
}

