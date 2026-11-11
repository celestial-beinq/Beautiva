export type CategorySlug =
  | 'hairdressers'
  | 'barbers'
  | 'nail-technicians'
  | 'lash-technicians'
  | 'makeup-artists'
  | 'tattoo-artists';

export interface CategoryInfo {
  slug: CategorySlug;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  coverImage: string;
  popularTags: string[];
}

export interface ServiceItem {
  id: string;
  name: string;
  categoryLabel: string;
  price: number; // in NGN
  durationMinutes: number;
  description: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  specialty: string;
  avatarColor: string;
}

export interface WorkingHours {
  day: string;
  open: string;
  close: string;
  closed?: boolean;
}

export interface BusinessReview {
  id: string;
  author: string;
  rating: number;
  serviceName: string;
  dateLabel: string;
  comment: string;
}

export interface PaymentPolicy {
  allowFull: boolean;
  allowDeposit: boolean;
  depositPercent: number;
  allowPayAtBusiness: boolean;
}

export type StudioStatus = 'active' | 'pending' | 'suspended';

export interface BusinessProfile {
  id: string;
  slug: string;
  name: string;
  categorySlug: CategorySlug;
  categoryLabel: string;
  tagline: string;
  about: string;
  location: string;
  city: string;
  address: string;
  logoText: string;
  logoBg: string;
  logoImage?: string;
  coverImage: string;
  gallery: string[];
  rating: number;
  reviewCount: number;
  verified: boolean;
  featured: boolean;
  status?: StudioStatus;
  services: ServiceItem[];
  staff: StaffMember[];
  workingHours: WorkingHours[];
  reviews: BusinessReview[];
  contact: {
    phone: string;
    email: string;
    instagram: string;
  };
  paymentPolicy: PaymentPolicy;
}

export type PaymentOption = 'full' | 'deposit' | 'pay-at-business';
export type PaymentStatus = 'Paid' | 'Deposit Paid' | 'Pay at Business' | 'Refunded';
export type BookingStatus = 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled';

export interface BookingRecord {
  bookingReference: string;
  businessSlug: string;
  businessName: string;
  businessLocation: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMinutes: number;
  date: string; // YYYY-MM-DD
  dateDisplay: string; // e.g. 15 November 2026
  time: string; // e.g. 10:00 AM
  staffName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string;
  paymentOption: PaymentOption;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
  paystackReference?: string;
  status: BookingStatus;
  createdAt: string;
}

export interface PopularServiceHighlight {
  businessSlug: string;
  businessName: string;
  businessLocation: string;
  categorySlug: CategorySlug;
  service: ServiceItem;
  coverImage: string;
}

