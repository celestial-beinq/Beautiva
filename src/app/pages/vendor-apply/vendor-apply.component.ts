import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CategorySlug, VendorApplication } from '../../models/marketplace.models';
import { MarketplaceService } from '../../services/marketplace.service';
import { PaystackService } from '../../services/paystack.service';

@Component({
  selector: 'app-vendor-apply',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './vendor-apply.component.html',
  styleUrl: './vendor-apply.component.css',
})
export class VendorApplyComponent {
  readonly marketplace = inject(MarketplaceService);
  private readonly paystack = inject(PaystackService);
  private readonly route = inject(ActivatedRoute);

  readonly categories = this.marketplace.categories;
  readonly applications = this.marketplace.vendorApplications;

  readonly activeTab = signal<'apply' | 'status'>('apply');
  readonly formError = signal('');
  readonly submittedApp = signal<VendorApplication | null>(null);
  readonly copiedAppNum = signal(false);

  // Status Lookup state
  lookupInput = '';
  readonly searchedAppNum = signal('');
  readonly launchingPaystack = signal(false);
  readonly paymentSuccessApp = signal<VendorApplication | null>(null);
  readonly paymentError = signal('');

  // Application form fields
  ownerName = '';
  email = '';
  phone = '';
  businessName = '';
  categorySlug: CategorySlug = 'hairdressers';
  city = 'Lagos';
  location = '';
  address = '';
  tagline = '';
  about = '';
  instagram = '';
  coverImage = 'images/cat-hairdressers.jpg';
  startingServiceName = 'Signature Session';
  startingServicePrice = 20000;
  startingServiceDurationMinutes = 60;

  readonly coverOptions = [
    { label: 'Hair & Braids', path: 'images/cat-hairdressers.jpg' },
    { label: 'Barbers & Fades', path: 'images/cat-barbers.jpg' },
    { label: 'Nails & Pedicure', path: 'images/cat-nails.jpg' },
    { label: 'Lashes', path: 'images/lashes-client-2.jpg' },
    { label: 'Makeup Glam', path: 'images/cat-makeup.jpg' },
    { label: 'Fine-Line Ink', path: 'images/cat-tattoo.jpg' },
    { label: 'Salon Interior', path: 'images/hero-salon.jpg' },
  ];

  readonly lookedUpApplication = computed(() => {
    const ref = this.searchedAppNum();
    if (!ref) return undefined;
    return this.marketplace.findApplicationByNumber(ref);
  });

  constructor() {
    const firstCat = this.categories()[0]?.slug;
    if (firstCat) this.categorySlug = firstCat;

    this.route.queryParamMap.subscribe((qp) => {
      const app = qp.get('app');
      const tab = qp.get('tab');
      if (app) {
        this.activeTab.set('status');
        this.lookupInput = app;
        this.searchedAppNum.set(app);
        void this.marketplace.lookupApplicationRemote(app);
      } else if (tab === 'status') {
        this.activeTab.set('status');
      }
    });
  }

  onCategoryChange(slug: CategorySlug): void {
    this.categorySlug = slug;
    const cat = this.marketplace.getCategoryBySlug(slug);
    if (cat?.coverImage) this.coverImage = cat.coverImage;
  }

  onCoverSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.coverImage = reader.result;
      }
    };
    reader.readAsDataURL(file);
  }

  submitApplication(): void {
    this.formError.set('');
    if (
      !this.ownerName.trim() ||
      !this.email.trim() ||
      !this.phone.trim() ||
      !this.businessName.trim() ||
      !this.location.trim()
    ) {
      this.formError.set(
        'Please complete Owner Name, Email, Phone, Business Name, and Area / Location.',
      );
      return;
    }

    const app = this.marketplace.submitVendorApplication({
      ownerName: this.ownerName,
      email: this.email,
      phone: this.phone,
      businessName: this.businessName,
      categorySlug: this.categorySlug,
      city: this.city,
      location: this.location,
      address: this.address,
      tagline: this.tagline,
      about: this.about,
      instagram: this.instagram,
      coverImage: this.coverImage,
      startingServiceName: this.startingServiceName,
      startingServicePrice: this.startingServicePrice,
      startingServiceDurationMinutes: this.startingServiceDurationMinutes,
    });

    this.submittedApp.set(app);
    this.lookupInput = app.applicationNumber;
    this.searchedAppNum.set(app.applicationNumber);
  }

  copyAppNumber(num: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(num);
      this.copiedAppNum.set(true);
      setTimeout(() => this.copiedAppNum.set(false), 2500);
    }
  }

  goToStatusCheck(appNum?: string): void {
    if (appNum) {
      this.lookupInput = appNum;
      this.searchedAppNum.set(appNum);
    }
    this.activeTab.set('status');
  }

  async checkStatus(): Promise<void> {
    this.paymentError.set('');
    this.paymentSuccessApp.set(null);
    const num = this.lookupInput.trim().toUpperCase();
    this.searchedAppNum.set(num);
    if (num) {
      await this.marketplace.lookupApplicationRemote(num);
    }
  }

  selectQuickApp(num: string): void {
    this.lookupInput = num;
    this.searchedAppNum.set(num);
    this.paymentError.set('');
  }

  async startOnboardingPayment(): Promise<void> {
    const app = this.lookedUpApplication();
    if (!app || this.launchingPaystack()) return;

    this.paymentError.set('');
    this.launchingPaystack.set(true);

    const result = await this.paystack.openCheckout({
      email: app.email,
      amountNaira: app.onboardingFee,
      metadata: {
        business_name: 'Beautiva Onboarding · ' + app.businessName,
        description: 'Approved Studio Activation (' + app.applicationNumber + ')',
      },
    });

    this.launchingPaystack.set(false);

    if (result.status === 'success' && result.reference) {
      await this.onPaystackSuccess(result.reference);
      return;
    }

    if (result.status === 'cancelled') {
      this.paymentError.set('Paystack window closed before payment completed.');
      return;
    }

    this.paymentError.set(result.error || 'Unable to complete Paystack payment.');
  }

  async onPaystackSuccess(paystackRef: string): Promise<void> {
    const app = this.lookedUpApplication();
    if (!app) return;

    const res = await this.marketplace.completeVendorApplicationPayment(
      app.applicationNumber,
      paystackRef,
    );
    if (!res.ok) {
      this.paymentError.set(res.error || 'Could not complete onboarding payment.');
      return;
    }
    if (res.application) {
      this.paymentSuccessApp.set(res.application);
    }
  }

  resetForm(): void {
    this.submittedApp.set(null);
    this.businessName = '';
    this.location = '';
    this.address = '';
    this.tagline = '';
    this.about = '';
    this.instagram = '';
  }
}
