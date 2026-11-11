import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserRole } from '../../models/marketplace.models';
import { AuthService } from '../../services/auth.service';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
})
export class AuthComponent {
  readonly auth = inject(AuthService);
  readonly marketplace = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly redirectTarget = signal<string>('/');
  readonly showPassword = signal<boolean>(false);
  readonly errorMsg = signal<string>('');
  readonly statusMsg = signal<string>('');

  email = '';
  password = '';

  constructor() {
    this.route.queryParamMap.subscribe((qp) => {
      const redirect = qp.get('redirect');
      if (redirect) this.redirectTarget.set(redirect);
    });
  }

  async submitSignIn(): Promise<void> {
    this.errorMsg.set('');
    this.statusMsg.set('');

    if (!this.email.trim() || !this.password) {
      this.errorMsg.set('Please enter your email address and password.');
      return;
    }

    const res = await this.auth.signIn(this.email, this.password);
    if (!res.ok) {
      this.errorMsg.set(res.error || 'Invalid email or password.');
      return;
    }

    this.navigateAfterAuth(res.profile?.role);
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.statusMsg.set('You have been signed out.');
  }

  private navigateAfterAuth(role?: UserRole): void {
    const target = this.redirectTarget();
    if (target && target !== '/' && target !== '/auth') {
      void this.router.navigateByUrl(target);
      return;
    }
    if (role === 'super_admin') {
      void this.router.navigate(['/admin']);
    } else if (role === 'vendor') {
      void this.router.navigate(['/vendor']);
    } else {
      void this.router.navigate(['/vendors']);
    }
  }
}
