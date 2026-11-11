import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  HostListener,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly currentUrl = signal(this.router.url || '/');
  readonly scrolled = signal(false);
  readonly mobileOpen = signal(false);

  readonly isTransparentHero = computed(
    () => this.currentUrl() === '/' && !this.scrolled() && !this.mobileOpen(),
  );

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        this.mobileOpen.set(false);
      });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!this.isBrowser) return;
    this.scrolled.set(window.scrollY > 40);
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}

