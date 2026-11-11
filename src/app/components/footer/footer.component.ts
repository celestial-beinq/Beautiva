import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  readonly marketplace = inject(MarketplaceService);
  readonly categories = this.marketplace.categories;
}

