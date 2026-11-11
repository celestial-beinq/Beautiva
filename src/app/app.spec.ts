import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
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
});
