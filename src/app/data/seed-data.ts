import {
  BookingRecord,
  BusinessProfile,
  CategoryInfo,
  WorkingHours,
} from '../models/marketplace.models';

export const DEFAULT_WORKING_HOURS: WorkingHours[] = [
  { day: 'Monday', open: '09:00 AM', close: '07:00 PM' },
  { day: 'Tuesday', open: '09:00 AM', close: '07:00 PM' },
  { day: 'Wednesday', open: '09:00 AM', close: '07:00 PM' },
  { day: 'Thursday', open: '09:00 AM', close: '08:00 PM' },
  { day: 'Friday', open: '09:00 AM', close: '08:00 PM' },
  { day: 'Saturday', open: '08:30 AM', close: '08:00 PM' },
  { day: 'Sunday', open: '12:00 PM', close: '06:00 PM' },
];

export const SEED_CATEGORIES: CategoryInfo[] = [];

export const SEED_BUSINESSES: BusinessProfile[] = [];

export const SEED_BOOKINGS: BookingRecord[] = [];
