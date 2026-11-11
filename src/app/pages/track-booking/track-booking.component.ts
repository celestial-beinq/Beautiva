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
  readonly remoteMatch = signal<BookingRecord | undefined>(undefined);

  readonly recentBookings = computed(() => this.marketplace.bookings().slice(0, 5));

  readonly foundBooking = computed<BookingRecord | undefined>(() => {
    const ref = this.searchedRef().trim();
    if (!ref) return undefined;
    return this.marketplace.findBookingByReference(ref) ?? this.remoteMatch();
  });

  constructor() {
    this.route.queryParamMap.subscribe((qp) => {
      const ref = qp.get('ref');
      if (ref) {
        this.referenceInput.set(ref);
        this.searchedRef.set(ref);
        void this.fetchRemoteIfNeeded(ref);
      }
    });
  }

  lookupBooking(): void {
    const ref = this.referenceInput().trim();
    this.searchedRef.set(ref);
    void this.fetchRemoteIfNeeded(ref);
  }

  selectSample(ref: string): void {
    this.referenceInput.set(ref);
    this.searchedRef.set(ref);
    this.remoteMatch.set(undefined);
  }

  cancelBooking(ref: string): void {
    this.marketplace.updateBookingStatus(ref, 'Cancelled');
  }

  private async fetchRemoteIfNeeded(ref: string): Promise<void> {
    if (!ref || this.marketplace.findBookingByReference(ref)) {
      this.remoteMatch.set(undefined);
      return;
    }
    const found = await this.marketplace.lookupBookingRemote(ref);
    this.remoteMatch.set(found);
  }
}
