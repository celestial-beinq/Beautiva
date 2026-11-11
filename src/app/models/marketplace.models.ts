export type CategorySlug =
  | 'hairdressers'
  | 'barbers'
  | 'nail-technicians'
  | 'lash-technicians'
  | 'makeup-artists'
  | 'tattoo-artists'
  | (string & {});

export type UserRole = 'super_admin' | 'vendor' | 'customer';
export type AccountStatus = 'active' | 'suspended';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  avatarUrl?: string;
  createdAt?: string;
}

export interface CategoryInfo {
  id?: string;
  slug: CategorySlug;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  coverImage: string;
  popularTags: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface ServiceItem {
  id: string;
  businessId?: string;
  name: string;
  categoryLabel: string;
  price: number; // in NGN
  durationMinutes: number;
  description: string;
  imageUrl?: string;
  isActive?: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  specialty: string;
  avatarColor: string;
  isActive?: boolean;
}

export interface WorkingHours {
  day: string;
  open: string;
  close: string;
  closed?: boolean;
}

export interface BreakWindow {
  id: string;
  day: string;
  start: string;
  end: string;
  label: string;
}

export interface AvailabilitySettings {
  slotDurationMinutes: number;
  bufferMinutes: number;
  blockedDates: string[];
  breaks: BreakWindow[];
  enabledSlots: string[];
}

export interface BusinessReview {
  id: string;
  businessId?: string;
  businessSlug?: string;
  author: string;
  rating: number;
  serviceName: string;
  dateLabel: string;
  comment: string;
  status?: 'published' | 'hidden' | 'flagged';
  createdAt?: string;
}

export interface PaymentPolicy {
  allowFull: boolean;
  allowDeposit: boolean;
  depositPercent: number;
  allowPayAtBusiness: boolean;
}

export type StudioStatus = 'active' | 'pending' | 'suspended';

export interface BusinessContact {
  phone: string;
  email: string;
  instagram: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

export interface BusinessProfile {
  id: string;
  ownerId?: string | null;
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
  availabilitySettings?: AvailabilitySettings;
  reviews: BusinessReview[];
  contact: BusinessContact;
  paymentPolicy: PaymentPolicy;
  createdAt?: string;
}

export type PaymentOption = 'full' | 'deposit' | 'pay-at-business';
export type PaymentStatus = 'Paid' | 'Deposit Paid' | 'Pay at Business' | 'Failed' | 'Refunded';
export type BookingStatus = 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled';

export interface BookingRecord {
  id?: string;
  bookingReference: string;
  businessId?: string;
  businessSlug: string;
  businessName: string;
  businessLocation: string;
  categorySlug?: CategorySlug;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMinutes: number;
  date: string; // YYYY-MM-DD
  dateDisplay: string; // e.g. 15 November 2026
  time: string; // e.g. 10:00 AM
  staffName: string;
  customerId?: string | null;
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
  rescheduledFrom?: string;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  bookingId?: string;
  bookingReference: string;
  businessId?: string;
  businessName: string;
  customerName: string;
  customerEmail: string;
  gateway: string;
  gatewayReference?: string;
  amount: number;
  platformCommissionRate: number;
  platformCommissionAmount: number;
  vendorNetAmount: number;
  status: 'success' | 'failed' | 'pending' | 'refunded';
  failureReason?: string;
  paidAt?: string;
  createdAt: string;
}

export type VendorApplicationStatus = 'pending' | 'approved' | 'declined' | 'paid_live';

export interface VendorApplication {
  id: string;
  applicationNumber: string;
  ownerName: string;
  email: string;
  phone: string;
  businessName: string;
  slug: string;
  categorySlug: CategorySlug;
  categoryLabel: string;
  city: string;
  location: string;
  address: string;
  tagline: string;
  about: string;
  instagram: string;
  coverImage: string;
  startingServiceName: string;
  startingServicePrice: number;
  startingServiceDurationMinutes: number;
  onboardingFee: number;
  status: VendorApplicationStatus;
  adminNote?: string;
  paystackReference?: string;
  paidAt?: string;
  issuedLoginEmail?: string;
  issuedTempPassword?: string;
  liveBusinessSlug?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface VendorInvitation {
  id: string;
  email: string;
  businessName: string;
  categorySlug: CategorySlug;
  city: string;
  inviteToken: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface PlatformSettings {
  commissionRate: number;
  siteName: string;
  heroHeadline: string;
  heroSubheadline: string;
  announcementBanner: string;
  supportEmail: string;
  supportPhone: string;
  notifyNewBooking: boolean;
  notifyPaymentFailed: boolean;
  notifyVendorApplication: boolean;
  notifyBookingReminders: boolean;
}

export interface PopularServiceHighlight {
  businessSlug: string;
  businessName: string;
  businessLocation: string;
  categorySlug: CategorySlug;
  service: ServiceItem;
  coverImage: string;
}
