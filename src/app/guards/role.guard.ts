import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const superAdminGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForReady();
  if (auth.isSuperAdmin()) return true;

  return router.createUrlTree(['/auth'], {
    queryParams: { redirect: '/admin', role: 'super_admin' },
  });
};

export const vendorGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForReady();
  if (auth.isVendor() || auth.isSuperAdmin()) return true;

  return router.createUrlTree(['/auth'], {
    queryParams: { redirect: '/vendor', role: 'vendor' },
  });
};
