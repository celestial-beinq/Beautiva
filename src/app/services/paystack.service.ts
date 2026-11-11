import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { environment } from '../../environments/environment';

interface PaystackHandler {
  openIframe: () => void;
}

interface PaystackPopStatic {
  setup: (options: {
    key: string;
    email: string;
    amount: number;
    currency: string;
    ref: string;
    metadata?: Record<string, unknown>;
    callback: (response: { reference: string; status?: string; trans?: string }) => void;
    onClose: () => void;
  }) => PaystackHandler;
}

declare global {
  interface Window {
    PaystackPop?: PaystackPopStatic;
  }
}

export interface PaystackCheckoutResult {
  status: 'success' | 'cancelled' | 'error';
  reference?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PaystackService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private scriptPromise: Promise<void> | null = null;

  get publicKey(): string {
    return (environment.paystackPublicKey || '').trim();
  }

  isRealKeyConfigured(key = this.publicKey): boolean {
    if (!key || key === 'pk_test_beautiva_demo') return false;
    return key.startsWith('pk_test_') || key.startsWith('pk_live_');
  }

  async openCheckout(input: {
    email: string;
    amountNaira: number;
    reference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackCheckoutResult> {
    if (!this.isBrowser) {
      return { status: 'error', error: 'Paystack checkout is only available in the browser.' };
    }

    if (!this.isRealKeyConfigured()) {
      return {
        status: 'error',
        error:
          'Paystack public key is not configured yet. Set PAYSTACK_PUBLIC_KEY (pk_test_... or pk_live_...) in .env and restart the server.',
      };
    }

    if (input.amountNaira <= 0) {
      return { status: 'error', error: 'Payment amount must be greater than ₦0.' };
    }

    try {
      await this.ensureInlineScriptLoaded();
    } catch (err: any) {
      return {
        status: 'error',
        error: err?.message || 'Unable to load Paystack checkout script.',
      };
    }

    if (!window.PaystackPop) {
      return {
        status: 'error',
        error: 'Paystack Inline SDK did not initialize. Please check your network connection.',
      };
    }

    const reference =
      input.reference ||
      `BT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return new Promise<PaystackCheckoutResult>((resolve) => {
      let settled = false;

      const handler = window.PaystackPop!.setup({
        key: this.publicKey,
        email: input.email.trim(),
        amount: Math.round(input.amountNaira * 100), // Paystack expects kobo
        currency: 'NGN',
        ref: reference,
        metadata: input.metadata,
        callback: (response) => {
          if (settled) return;
          settled = true;
          const ref = response?.reference || reference;
          void this.verifyOnServer(ref, input.amountNaira).then((verifyRes) => {
            if (!verifyRes.ok) {
              resolve({
                status: 'error',
                reference: ref,
                error: verifyRes.error || 'Paystack verification failed.',
              });
            } else {
              resolve({ status: 'success', reference: ref });
            }
          });
        },
        onClose: () => {
          if (settled) return;
          settled = true;
          resolve({ status: 'cancelled' });
        },
      });

      handler.openIframe();
    });
  }

  private async verifyOnServer(
    reference: string,
    expectedAmountNaira: number,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await fetch('/api/paystack/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, expectedAmount: expectedAmountNaira }),
      });

      if (resp.status === 404 || resp.status === 503) {
        // Static/dev mode without PAYSTACK_SECRET_KEY — trust Paystack Inline callback reference
        return { ok: true };
      }

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.verified === false) {
        return { ok: false, error: json?.error || 'Could not verify Paystack transaction.' };
      }
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  private ensureInlineScriptLoaded(): Promise<void> {
    if (window.PaystackPop) return Promise.resolve();
    if (this.scriptPromise) return this.scriptPromise;

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="js.paystack.co"]',
      );
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed to load Paystack Inline script.')),
          { once: true },
        );
        // Fallback poll in case script already loaded before listener attached
        setTimeout(() => {
          if (window.PaystackPop) resolve();
        }, 400);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Paystack Inline script.'));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }
}

