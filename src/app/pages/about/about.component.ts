import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {
  readonly marketplace = inject(MarketplaceService);
  readonly categories = this.marketplace.categories;
  readonly activeCount = this.marketplace.activeBusinesses;
}
