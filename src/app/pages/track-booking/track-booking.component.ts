import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingRecord } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-track-booking',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './track-booking.component.html',
  styleUrl: './track-booking.component.css',
})
export class TrackBookingComponent {
  readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);

  readonly referenceInput = signal('BK-2026-000124');
  readonly searchedRef = signal('BK-2026-000124');

  readonly recentBookings = computed(() => this.marketplace.bookings().slice(0, 5));

  readonly foundBooking = computed<BookingRecord | undefined>(() => {
    const ref = this.searchedRef().trim();
    return ref ? this.marketplace.findBookingByReference(ref) : undefined;
  });

  constructor() {
    this.route.queryParamMap.subscribe((qp) => {
      const ref = qp.get('ref');
      if (ref) {
        this.referenceInput.set(ref);
        this.searchedRef.set(ref);
      }
    });
  }

  lookupBooking(): void {
    this.searchedRef.set(this.referenceInput().trim());
  }

  selectSample(ref: string): void {
    this.referenceInput.set(ref);
    this.searchedRef.set(ref);
  }

  cancelBooking(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Cancelled');
  }
}

