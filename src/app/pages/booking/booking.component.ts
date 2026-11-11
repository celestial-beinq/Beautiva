import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PaystackModalComponent } from '../../components/paystack-modal/paystack-modal.component';
import { BookingRecord, PaymentOption } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';

interface DateChip {
  iso: string;
  dayShort: string;
  dateNum: string;
  monthShort: string;
  displayFull: string;
}

const ALL_SLOTS = [
  '09:00 AM',
  '10:00 AM',
  '11:30 AM',
  '01:00 PM',
  '02:30 PM',
  '04:00 PM',
  '05:30 PM',
];

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [RouterLink, FormsModule, PaystackModalComponent],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.css',
})
export class BookingComponent {
  readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);

  readonly slug = signal('glamour-studio');
  readonly business = computed(() => this.marketplace.getBusinessBySlug(this.slug()));

  readonly dateOptions: DateChip[] = this.buildDateOptions();
  readonly timeSlots = ALL_SLOTS;

  readonly selectedServiceId = signal<string>('');
  readonly selectedDate = signal<string>(this.dateOptions[0].iso);
  readonly selectedTime = signal<string>('10:00 AM');
  readonly selectedStaff = signal<string>('Any available specialist');

  customerName = '';
  customerEmail = '';
  customerPhone = '';
  customerNotes = '';

  readonly paymentOption = signal<PaymentOption>('full');
  readonly validationError = signal('');
  readonly showPaystackModal = signal(false);
  readonly confirmedBooking = signal<BookingRecord | null>(null);
  readonly copiedRef = signal(false);

  readonly selectedService = computed(() => {
    const biz = this.business();
    if (!biz) return undefined;
    return biz.services.find((s) => s.id === this.selectedServiceId()) ?? biz.services[0];
  });

  readonly bookedSlots = computed(() =>
    this.marketplace.getBookedSlots(this.slug(), this.selectedDate()),
  );

  readonly selectedDateDisplay = computed(() => {
    const match = this.dateOptions.find((d) => d.iso === this.selectedDate());
    return match ? match.displayFull : this.selectedDate();
  });

  readonly payableNow = computed(() => {
    const srv = this.selectedService();
    const biz = this.business();
    if (!srv || !biz) return 0;
    const opt = this.paymentOption();
    if (opt === 'full') return srv.price;
    if (opt === 'deposit') {
      return Math.round((srv.price * (biz.paymentPolicy.depositPercent || 30)) / 100);
    }
    return 0;
  });

  readonly balanceAtVenue = computed(() => {
    const srv = this.selectedService();
    if (!srv) return 0;
    return Math.max(0, srv.price - this.payableNow());
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const s = params.get('slug');
      if (s) {
        this.slug.set(s);
        const biz = this.marketplace.getBusinessBySlug(s);
        if (biz && biz.services.length > 0) {
          this.selectedServiceId.set(biz.services[0].id);
        }
      }
    });

    this.route.queryParamMap.subscribe((qp) => {
      const srvId = qp.get('service');
      const biz = this.business();
      if (srvId && biz?.services.some((s) => s.id === srvId)) {
        this.selectedServiceId.set(srvId);
      }
    });
  }

  isSlotBooked(slot: string): boolean {
    return this.bookedSlots().includes(slot);
  }

  selectDate(iso: string): void {
    this.selectedDate.set(iso);
    if (this.isSlotBooked(this.selectedTime())) {
      const free = this.timeSlots.find((t) => !this.isSlotBooked(t));
      if (free) this.selectedTime.set(free);
    }
  }

  proceedToCheckout(): void {
    this.validationError.set('');
    if (!this.selectedService()) {
      this.validationError.set('Please select a service to continue.');
      return;
    }
    if (this.isSlotBooked(this.selectedTime())) {
      this.validationError.set('That time slot is already booked. Please choose another time.');
      return;
    }
    if (!this.customerName.trim() || !this.customerEmail.trim() || !this.customerPhone.trim()) {
      this.validationError.set('Please enter your full name, email address, and phone number.');
      return;
    }
    if (!this.customerEmail.includes('@')) {
      this.validationError.set('Please enter a valid email address for your booking confirmation.');
      return;
    }

    if (this.paymentOption() === 'pay-at-business') {
      this.finalizeBooking();
    } else {
      this.showPaystackModal.set(true);
    }
  }

  onPaystackSuccess(paystackRef: string): void {
    this.showPaystackModal.set(false);
    this.finalizeBooking(paystackRef);
  }

  copyReference(ref: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(ref);
      this.copiedRef.set(true);
      setTimeout(() => this.copiedRef.set(false), 2000);
    }
  }

  private finalizeBooking(paystackReference?: string): void {
    const srv = this.selectedService();
    const biz = this.business();
    if (!srv || !biz) return;

    const record = this.marketplace.createBooking({
      businessSlug: biz.slug,
      serviceId: srv.id,
      date: this.selectedDate(),
      dateDisplay: this.selectedDateDisplay(),
      time: this.selectedTime(),
      staffName: this.selectedStaff(),
      customerName: this.customerName,
      customerEmail: this.customerEmail,
      customerPhone: this.customerPhone,
      notes: this.customerNotes,
      paymentOption: this.paymentOption(),
      paystackReference,
    });

    this.confirmedBooking.set(record);
  }

  private buildDateOptions(): DateChip[] {
    const list: DateChip[] = [];
    const base = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const fullMonths = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    for (let i = 0; i < 10; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      list.push({
        iso: `${yyyy}-${mm}-${dd}`,
        dayShort: i === 0 ? 'Today' : days[d.getDay()],
        dateNum: String(d.getDate()),
        monthShort: months[d.getMonth()],
        displayFull: `${d.getDate()} ${fullMonths[d.getMonth()]} ${yyyy}`,
      });
    }
    return list;
  }
}

