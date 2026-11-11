import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-paystack-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './paystack-modal.component.html',
  styleUrl: './paystack-modal.component.css',
})
export class PaystackModalComponent {
  @Input({ required: true }) businessName!: string;
  @Input({ required: true }) customerEmail!: string;
  @Input({ required: true }) amount!: number;
  @Input() description = 'Service booking payment';

  @Output() cancel = new EventEmitter<void>();
  @Output() success = new EventEmitter<string>();

  readonly channel = signal<'card' | 'bank' | 'ussd'>('card');
  readonly processing = signal(false);

  cardNumber = '4084 0841 2345 6789';
  expiry = '12/28';
  cvv = '408';

  formatNaira(val: number): string {
    return `₦${val.toLocaleString('en-NG')}`;
  }

  completeTestPayment(): void {
    if (this.processing()) return;
    this.processing.set(true);
    setTimeout(() => {
      const ref = `PSK_${Date.now().toString().slice(-8)}`;
      this.processing.set(false);
      this.success.emit(ref);
    }, 950);
  }
}

