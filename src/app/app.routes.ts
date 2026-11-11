import { Routes } from '@angular/router';
import { superAdminGuard, vendorGuard } from './guards/role.guard';
import { BookingComponent } from './pages/booking/booking.component';
import { BusinessSiteComponent } from './pages/business-site/business-site.component';
import { CategoryComponent } from './pages/category/category.component';
import { HomeComponent } from './pages/home/home.component';
import { TrackBookingComponent } from './pages/track-booking/track-booking.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Beautiva — Nigerian Beauty & Personal Care Marketplace' },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent),
    title: 'About Beautiva — Nigerian Beauty Marketplace',
  },
  { path: 'vendors', component: CategoryComponent, title: 'Vendors & Studios — Beautiva' },
  { path: 'businesses', component: CategoryComponent, title: 'Explore Studios — Beautiva' },
  { path: 'category/:slug', component: CategoryComponent, title: 'Category Listings — Beautiva' },
  { path: 'business/:slug', component: BusinessSiteComponent, title: 'Studio Website — Beautiva' },
  { path: 'book/:slug', component: BookingComponent, title: 'Book Appointment — Beautiva' },
  { path: 'track', component: TrackBookingComponent, title: 'Track Booking — Beautiva' },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact.component').then((m) => m.ContactComponent),
    title: 'Contact Concierge — Beautiva',
  },
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth.component').then((m) => m.AuthComponent),
    title: 'Sign In & Role Access — Beautiva',
  },
  {
    path: 'apply',
    loadComponent: () =>
      import('./pages/vendor-apply/vendor-apply.component').then((m) => m.VendorApplyComponent),
    title: 'Vendor Application & Onboarding — Beautiva',
  },
  {
    path: 'vendor',
    canActivate: [vendorGuard],
    loadComponent: () =>
      import('./pages/vendor-studio/vendor-studio.component').then((m) => m.VendorStudioComponent),
    title: 'Vendor Dashboard — Beautiva',
  },
  {
    path: 'admin',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent,
      ),
    title: 'Super Admin Console — Beautiva',
  },
  { path: '**', redirectTo: '' },
];
