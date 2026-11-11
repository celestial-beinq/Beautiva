import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './services/auth.service';
import { MarketplaceService } from './services/marketplace.service';

describe('App & MarketplaceService', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

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

  it('should seed all 6 categories and find BK-2026-000124', () => {
    const service = TestBed.inject(MarketplaceService);
    expect(service.categories().length).toBe(6);
    const seeded = service.findBookingByReference('BK-2026-000124');
    expect(seeded).toBeDefined();
    expect(seeded?.businessName).toBe('Glamour Studio');
    expect(seeded?.serviceName).toBe('Knotless Braids');
  });

  it('should create a booking with sequential reference and deposit calculation', () => {
    const service = TestBed.inject(MarketplaceService);
    const created = service.createBooking({
      businessSlug: 'glamour-studio',
      serviceId: 'srv-gs-1',
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

    expect(created.bookingReference).toMatch(/^BK-2026-\d{6}$/);
    expect(created.paymentStatus).toBe('Deposit Paid');
    expect(created.amountPaid).toBe(7500);
    expect(created.balanceDue).toBe(17500);
    expect(service.findBookingByReference(created.bookingReference)?.status).toBe('Confirmed');
  });

  it('should support vendor updates and super admin studio governance', () => {
    const service = TestBed.inject(MarketplaceService);
    const initialActive = service.activeBusinesses().length;

    service.setBusinessStatus('velvet-crown-atelier', 'suspended');
    expect(service.activeBusinesses().length).toBe(initialActive - 1);

    service.setBusinessStatus('velvet-crown-atelier', 'active');
    expect(service.activeBusinesses().length).toBe(initialActive);

    const beforeVerified = service.getBusinessBySlug('glamour-studio')?.verified;
    service.toggleBusinessVerified('glamour-studio');
    expect(service.getBusinessBySlug('glamour-studio')?.verified).toBe(!beforeVerified);
  });

  it('should support category CRUD, platform commission settings, and failed payment logging', () => {
    const service = TestBed.inject(MarketplaceService);
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

    service.updatePlatformSettings({ commissionRate: 15 });
    expect(service.platformSettings().commissionRate).toBe(15);

    const tx = service.recordFailedPayment({
      businessSlug: 'glamour-studio',
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

    const user = auth.switchDemoRole('super_admin');
    expect(user.role).toBe('super_admin');
    expect(auth.isSuperAdmin()).toBe(true);

    const biz = service.getBusinessBySlug('glamour-studio')!;
    service.updateStudioConfiguration('glamour-studio', {
      availabilitySettings: {
        slotDurationMinutes: 60,
        bufferMinutes: 15,
        blockedDates: ['2026-12-25'],
        breaks: [],
        enabledSlots: ['10:00 AM', '02:30 PM'],
      },
    });

    const updatedBiz = service.getBusinessBySlug('glamour-studio')!;
    expect(service.isDateBlocked(updatedBiz, '2026-12-25')).toBe(true);
    expect(service.getEnabledSlotsForBusiness(updatedBiz, '2026-12-25')).toEqual([]);
    expect(service.getEnabledSlotsForBusiness(updatedBiz, '2026-12-26')).toEqual([
      '10:00 AM',
      '02:30 PM',
    ]);

    const rescheduled = service.rescheduleBooking('BK-2026-000124', '2026-12-26', '26 December 2026', '02:30 PM');
    expect(rescheduled?.time).toBe('02:30 PM');
    expect(rescheduled?.rescheduledFrom).toBeTruthy();
    expect(biz.slug).toBe('glamour-studio');
  });
});
