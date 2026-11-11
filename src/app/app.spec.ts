import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { DEFAULT_WORKING_HOURS } from './data/seed-data';
import { AuthService } from './services/auth.service';
import { MarketplaceService } from './services/marketplace.service';
import { PaystackService } from './services/paystack.service';

describe('App & MarketplaceService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  function seedAdminTestStudio(service: MarketplaceService) {
    service.upsertCategory({
      slug: 'hairdressers',
      name: 'Hairdressers / Hair Stylists',
      shortName: 'Hair Stylists',
      tagline: 'Braids, silk press & wigs',
      description: 'Hair styling studios',
      coverImage: 'images/cat-hairdressers.jpg',
      popularTags: ['Knotless Braids'],
    });

    return service.upsertBusiness({
      slug: 'atelier-lagos',
      name: 'Atelier Lagos',
      categorySlug: 'hairdressers',
      categoryLabel: 'Hairdressers / Hair Stylists',
      tagline: 'Luxury hair care in Lekki',
      about: 'Admin-created test studio.',
      location: 'Lekki Phase 1, Lagos',
      city: 'Lagos',
      address: '14 Admiralty Way, Lekki',
      logoText: 'AL',
      logoBg: '#302c28',
      coverImage: 'images/cat-hairdressers.jpg',
      gallery: ['images/cat-hairdressers.jpg'],
      featured: true,
      verified: true,
      status: 'active',
      services: [
        {
          id: 'srv-al-1',
          name: 'Knotless Braids',
          categoryLabel: 'Protective Styling',
          price: 25000,
          durationMinutes: 180,
          description: 'Weightless medium knotless braids.',
          isActive: true,
        },
      ],
      staff: [
        {
          id: 'stf-al-1',
          name: 'Tolu Adeyemi',
          role: 'Lead Stylist',
          specialty: 'Knotless Braids',
          avatarColor: '#a67c52',
        },
      ],
      workingHours: DEFAULT_WORKING_HOURS,
      contact: { phone: '+234 800 000 0000', email: 'hello@atelierlagos.ng', instagram: '@atelierlagos' },
      paymentPolicy: { allowFull: true, allowDeposit: true, depositPercent: 30, allowPayAtBusiness: true },
    });
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the Beautiva navbar brand', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('BEAUTIVA');
  });

  it('should start with zero preloaded data until admin creates categories and studios', () => {
    const service = TestBed.inject(MarketplaceService);
    expect(service.categories().length).toBe(0);
    expect(service.businesses().length).toBe(0);
    expect(service.bookings().length).toBe(0);
    expect(service.transactions().length).toBe(0);

    seedAdminTestStudio(service);
    expect(service.categories().length).toBe(1);
    expect(service.businesses().length).toBe(1);
  });

  it('should create a booking with sequential reference and deposit calculation', () => {
    const service = TestBed.inject(MarketplaceService);
    seedAdminTestStudio(service);

    const created = service.createBooking({
      businessSlug: 'atelier-lagos',
      serviceId: 'srv-al-1',
      date: '2026-11-20',
      dateDisplay: '20 November 2026',
      time: '01:00 PM',
      staffName: 'Tolu Adeyemi',
      customerName: 'Test Customer',
      customerEmail: 'test@beautiva.ng',
      customerPhone: '+234 800 000 0000',
      paymentOption: 'deposit',
      paystackReference: 'PSK_TEST_123',
    });

    expect(created.bookingReference).toBe('BK-2026-000001');
    expect(created.paymentStatus).toBe('Deposit Paid');
    expect(created.amountPaid).toBe(7500);
    expect(created.balanceDue).toBe(17500);
    expect(service.findBookingByReference(created.bookingReference)?.status).toBe('Confirmed');
  });

  it('should support vendor updates and super admin studio governance', async () => {
    const service = TestBed.inject(MarketplaceService);
    seedAdminTestStudio(service);
    const initialActive = service.activeBusinesses().length;

    service.setBusinessStatus('atelier-lagos', 'suspended');
    expect(service.activeBusinesses().length).toBe(initialActive - 1);

    service.setBusinessStatus('atelier-lagos', 'active');
    expect(service.activeBusinesses().length).toBe(initialActive);

    const beforeVerified = service.getBusinessBySlug('atelier-lagos')?.verified;
    await service.toggleBusinessVerified('atelier-lagos');
    expect(service.getBusinessBySlug('atelier-lagos')?.verified).toBe(!beforeVerified);

    const beforeFeatured = service.getBusinessBySlug('atelier-lagos')?.featured;
    await service.toggleBusinessFeatured('atelier-lagos');
    expect(service.getBusinessBySlug('atelier-lagos')?.featured).toBe(!beforeFeatured);

    await service.saveStudioConfiguration('atelier-lagos', { tagline: 'Updated Lekki studio' });
    expect(service.getBusinessBySlug('atelier-lagos')?.tagline).toBe('Updated Lekki studio');

    await service.deleteBusiness('atelier-lagos');
    expect(service.getBusinessBySlug('atelier-lagos')).toBeUndefined();
  });

  it('should support category CRUD, platform commission settings, and failed payment logging', () => {
    const service = TestBed.inject(MarketplaceService);
    seedAdminTestStudio(service);
    const initialCats = service.categories().length;

    const created = service.upsertCategory({
      slug: 'spa-wellness',
      name: 'Spa & Wellness',
      shortName: 'Spa',
      tagline: 'Holistic body treatments',
      description: 'Relaxing spa sessions',
      coverImage: 'images/hero-salon.jpg',
      popularTags: ['Facial', 'Massage'],
    });
    expect(service.categories().length).toBe(initialCats + 1);
    expect(created.slug).toBe('spa-wellness');

    service.deleteCategory('spa-wellness');
    expect(service.categories().length).toBe(initialCats);

    service.updatePlatformSettings({ commissionRate: 15, vendorOnboardingFee: 35000 });
    expect(service.platformSettings().commissionRate).toBe(15);
    expect(service.platformSettings().vendorOnboardingFee).toBe(35000);

    const appWithCustomFee = service.submitVendorApplication({
      ownerName: 'Fee Test',
      email: 'feetest@beautiva.ng',
      phone: '+234 800 111 2222',
      businessName: 'Fee Test Studio',
      categorySlug: 'hairdressers',
      city: 'Lagos',
      location: 'Lekki, Lagos',
      startingServiceName: 'Silk Press',
      startingServicePrice: 18000,
    });
    expect(appWithCustomFee.onboardingFee).toBe(35000);

    const tx = service.recordFailedPayment({
      businessSlug: 'atelier-lagos',
      customerName: 'Test Fail',
      customerEmail: 'fail@beautiva.ng',
      amount: 12000,
      reason: 'Card declined',
    });
    expect(tx.status).toBe('failed');
  });

  it('should support vendor availability blocking, booking rescheduling, and demo role switching', () => {
    const service = TestBed.inject(MarketplaceService);
    const auth = TestBed.inject(AuthService);
    seedAdminTestStudio(service);

    const user = auth.switchDemoRole('super_admin');
    expect(user.role).toBe('super_admin');
    expect(auth.isSuperAdmin()).toBe(true);

    const createdBooking = service.createBooking({
      businessSlug: 'atelier-lagos',
      serviceId: 'srv-al-1',
      date: '2026-11-21',
      dateDisplay: '21 November 2026',
      time: '10:00 AM',
      staffName: 'Tolu Adeyemi',
      customerName: 'Adaeze',
      customerEmail: 'adaeze@beautiva.ng',
      customerPhone: '+234 800 000 0000',
      paymentOption: 'full',
    });

    const biz = service.getBusinessBySlug('atelier-lagos')!;
    service.updateStudioConfiguration('atelier-lagos', {
      availabilitySettings: {
        slotDurationMinutes: 60,
        bufferMinutes: 15,
        blockedDates: ['2026-12-25'],
        breaks: [],
        enabledSlots: ['10:00 AM', '02:30 PM'],
      },
    });

    const updatedBiz = service.getBusinessBySlug('atelier-lagos')!;
    expect(service.isDateBlocked(updatedBiz, '2026-12-25')).toBe(true);
    expect(service.getEnabledSlotsForBusiness(updatedBiz, '2026-12-25')).toEqual([]);
    expect(service.getEnabledSlotsForBusiness(updatedBiz, '2026-12-26')).toEqual([
      '10:00 AM',
      '02:30 PM',
    ]);

    const rescheduled = service.rescheduleBooking(
      createdBooking.bookingReference,
      '2026-12-26',
      '26 December 2026',
      '02:30 PM',
    );
    expect(rescheduled?.time).toBe('02:30 PM');
    expect(rescheduled?.rescheduledFrom).toBeTruthy();
    expect(biz.slug).toBe('atelier-lagos');
  });

  it('should support full vendor application, admin approval, onboarding payment, and live listing', async () => {
    const service = TestBed.inject(MarketplaceService);
    const auth = TestBed.inject(AuthService);

    const app = service.submitVendorApplication({
      ownerName: 'Chidinma Obi',
      email: 'chidinma@obiatelier.ng',
      phone: '+234 809 111 2233',
      businessName: 'Obi Beauty Atelier',
      categorySlug: 'hairdressers',
      city: 'Lagos',
      location: 'Lekki Phase 1, Lagos',
      startingServiceName: 'Knotless Braids',
      startingServicePrice: 25000,
    });

    expect(app.applicationNumber).toMatch(/^APP-2026-\d{6}$/);
    expect(app.status).toBe('pending');

    // Super Admin views & approves application
    const reviewed = await service.reviewVendorApplication(
      app.applicationNumber,
      'approved',
      'Verified studio details.',
    );
    expect(reviewed.ok).toBe(true);
    expect(reviewed.application?.status).toBe('approved');

    // Vendor checks status by Application Number & pays onboarding fee via Paystack
    const lookedUp = service.findApplicationByNumber(app.applicationNumber);
    expect(lookedUp?.status).toBe('approved');

    const activation = await service.completeVendorApplicationPayment(
      app.applicationNumber,
      'PSK_ONBOARD_999',
    );
    expect(activation.ok).toBe(true);
    expect(activation.application?.status).toBe('paid_live');
    expect(activation.application?.issuedTempPassword).toBeTruthy();
    expect(activation.business?.slug).toBe('obi-beauty-atelier');
    expect(
      service.activeBusinesses().some((b) => b.slug === 'obi-beauty-atelier'),
    ).toBe(true);

    // Vendor can sign in with issued credentials
    const login = await auth.signIn(
      activation.application!.issuedLoginEmail!,
      activation.application!.issuedTempPassword!,
    );
    expect(login.ok).toBe(true);
    expect(login.profile?.role).toBe('vendor');
  });

  it('should require a real Paystack public key instead of demo placeholder', () => {
    const paystack = TestBed.inject(PaystackService);
    expect(paystack.isRealKeyConfigured('pk_test_beautiva_demo')).toBe(false);
    expect(paystack.isRealKeyConfigured('')).toBe(false);
    expect(paystack.isRealKeyConfigured('pk_test_1234567890abcdef')).toBe(true);
    expect(paystack.isRealKeyConfigured('pk_live_1234567890abcdef')).toBe(true);
  });
});
