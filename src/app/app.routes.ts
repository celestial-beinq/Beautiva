import { Routes } from '@angular/router';
import { BookingComponent } from './pages/booking/booking.component';
import { BusinessSiteComponent } from './pages/business-site/business-site.component';
import { CategoryComponent } from './pages/category/category.component';
import { HomeComponent } from './pages/home/home.component';
import { TrackBookingComponent } from './pages/track-booking/track-booking.component';
import { VendorStudioComponent } from './pages/vendor-studio/vendor-studio.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Beautiva — Beauty & Personal Care Marketplace' },
  { path: 'businesses', component: CategoryComponent, title: 'Explore Studios — Beautiva' },
  { path: 'category/:slug', component: CategoryComponent, title: 'Category Listings — Beautiva' },
  { path: 'business/:slug', component: BusinessSiteComponent, title: 'Studio Website — Beautiva' },
  { path: 'book/:slug', component: BookingComponent, title: 'Book Appointment — Beautiva' },
  { path: 'track', component: TrackBookingComponent, title: 'Track Booking — Beautiva' },
  { path: 'vendor', component: VendorStudioComponent, title: 'Vendor Studio Builder — Beautiva' },
  { path: '**', redirectTo: '' },
];
