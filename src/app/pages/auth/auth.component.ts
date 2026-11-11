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

  readonly mode = signal<'signin' | 'signup'>('signin');
  readonly requestedRole = signal<'customer' | 'vendor'>('customer');
  readonly redirectTarget = signal<string>('/');
  readonly inviteToken = signal<string>('');
  readonly inviteBusinessName = signal<string>('');
  readonly errorMsg = signal<string>('');
  readonly successMsg = signal<string>('');
  readonly demoStudioSlug = signal<string>('glamour-studio');

  email = '';
  password = '';
  fullName = '';
  phone = '';

  constructor() {
    this.route.queryParamMap.subscribe(async (qp) => {
      const redirect = qp.get('redirect');
      if (redirect) this.redirectTarget.set(redirect);

      const role = qp.get('role');
      if (role === 'vendor') {
        this.requestedRole.set('vendor');
      }

      const invite = qp.get('invite');
      if (invite) {
        this.mode.set('signup');
        this.requestedRole.set('vendor');
        this.inviteToken.set(invite);
        const found = await this.auth.lookupInvitation(invite);
        if (found) {
          this.email = found.email;
          this.inviteBusinessName.set(found.businessName);
        }
      }
    });
  }

  async submitSignIn(): Promise<void> {
    this.errorMsg.set('');
    this.successMsg.set('');

    if (!this.email.trim() || !this.password) {
      this.errorMsg.set('Please enter your email and password.');
      return;
    }

    const res = await this.auth.signIn(this.email, this.password);
    if (!res.ok) {
      this.errorMsg.set(res.error || 'Sign in failed.');
      return;
    }

    this.navigateAfterAuth(res.profile?.role);
  }

  async submitSignUp(): Promise<void> {
    this.errorMsg.set('');
    this.successMsg.set('');

    if (!this.fullName.trim() || !this.email.trim() || this.password.length < 6) {
      this.errorMsg.set('Enter your full name, email, and a password of at least 6 characters.');
      return;
    }

    const res = await this.auth.signUp({
      email: this.email,
      password: this.password,
      fullName: this.fullName,
      phone: this.phone,
      role: this.requestedRole(),
      inviteToken: this.inviteToken() || undefined,
    });

    if (!res.ok) {
      this.errorMsg.set(res.error || 'Registration failed.');
      return;
    }

    if (res.needsEmailConfirmation) {
      this.successMsg.set(
        'Account created! Please check your email inbox to confirm your address before signing in.',
      );
      this.mode.set('signin');
      return;
    }

    this.navigateAfterAuth(res.profile?.role);
  }

  quickSwitch(role: UserRole): void {
    this.errorMsg.set('');
    this.auth.switchDemoRole(role, this.demoStudioSlug());
    this.navigateAfterAuth(role);
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.successMsg.set('Signed out cleanly.');
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

