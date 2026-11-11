import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessProfile } from '../../models/marketplace.models';

@Component({
  selector: 'app-business-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './business-card.component.html',
  styleUrl: './business-card.component.css',
})
export class BusinessCardComponent {
  readonly business = input.required<BusinessProfile>();
}
