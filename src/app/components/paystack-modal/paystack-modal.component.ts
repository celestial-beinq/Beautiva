import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { PaystackService } from '../../services/paystack.service';

@Component({
  selector: 'app-paystack-modal',
  standalone: true,
  imports: [],
  templateUrl: './paystack-modal.component.html',
  styleUrl: './paystack-modal.component.css',
})
export class PaystackModalComponent implements OnInit {
  private readonly paystack = inject(PaystackService);

  readonly businessName = input.required<string>();
  readonly customerEmail = input.required<string>();
  readonly amount = input.required<number>();
  readonly description = input<string>('Service booking payment');

  readonly cancel = output<void>();
  readonly success = output<string>();

  readonly processing = signal(false);
  readonly statusMessage = signal('Launching Paystack secure checkout...');
  readonly errorMessage = signal('');

  get isTestMode(): boolean {
    return this.paystack.publicKey.startsWith('pk_test_');
  }

  get hasRealKey(): boolean {
    return this.paystack.isRealKeyConfigured();
  }

  ngOnInit(): void {
    void this.launchCheckout();
  }

  formatNaira(val: number): string {
    return `₦${val.toLocaleString('en-NG')}`;
  }

  async launchCheckout(): Promise<void> {
    if (this.processing()) return;
    this.errorMessage.set('');
    this.processing.set(true);
    this.statusMessage.set('Opening Paystack Checkout...');

    const result = await this.paystack.openCheckout({
      email: this.customerEmail(),
      amountNaira: this.amount(),
      metadata: {
        business_name: this.businessName(),
        description: this.description(),
      },
    });

    this.processing.set(false);

    if (result.status === 'success' && result.reference) {
      this.statusMessage.set('Payment verified!');
      this.success.emit(result.reference);
      return;
    }

    if (result.status === 'cancelled') {
      this.statusMessage.set('Paystack window closed before payment completed.');
      return;
    }

    this.errorMessage.set(result.error || 'Unable to complete Paystack payment.');
    this.statusMessage.set('');
  }
}
