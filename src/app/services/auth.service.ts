import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { UserProfile, UserRole, VendorInvitation } from '../models/marketplace.models';
import { SupabaseService } from './supabase.service';

const DEMO_SESSION_KEY = 'beautiva_demo_session_v1';

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
  profile?: UserProfile;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly sb = inject(SupabaseService);

  readonly currentUser = signal<UserProfile | null>(null);
  readonly authMode = signal<'supabase' | 'demo' | 'guest'>('guest');
  readonly accessToken = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly demoVendorStudioSlug = signal<string>('glamour-studio');

  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<UserRole | null>(() => this.currentUser()?.role ?? null);
  readonly isSuperAdmin = computed(() => this.currentUser()?.role === 'super_admin');
  readonly isVendor = computed(() => this.currentUser()?.role === 'vendor');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'customer');

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.isBrowser ? this.initSession() : Promise.resolve();
  }

  waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  private async initSession(): Promise<void> {
    if (this.sb.client) {
      const { data } = await this.sb.client.auth.getSession();
      if (data.session?.user) {
        this.accessToken.set(data.session.access_token);
        await this.loadProfileFromSupabase(data.session.user.id, data.session.user.email ?? '');
        this.authMode.set('supabase');
      }

      this.sb.client.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          this.accessToken.set(session.access_token);
          await this.loadProfileFromSupabase(session.user.id, session.user.email ?? '');
          this.authMode.set('supabase');
        } else if (this.authMode() === 'supabase') {
          this.accessToken.set(null);
          this.currentUser.set(null);
          this.authMode.set('guest');
        }
      });

      if (data.session?.user) return;
    }

    // Restore demo quick-switch session if present
    try {
      const raw = localStorage.getItem(DEMO_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { user: UserProfile; studioSlug?: string };
        if (parsed?.user) {
          this.currentUser.set(parsed.user);
          this.authMode.set('demo');
          if (parsed.studioSlug) {
            this.demoVendorStudioSlug.set(parsed.studioSlug);
          }
        }
      }
    } catch {
      // Ignore storage error
    }
  }

  async signIn(email: string, password: string): Promise<AuthActionResult> {
    if (!this.sb.client) {
      return {
        ok: false,
        error: 'Supabase .env keys are not configured yet. Use Demo Quick-Switch below or add SUPABASE_URL & SUPABASE_ANON_KEY to .env.',
      };
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.sb.client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.user) {
        return { ok: false, error: error?.message || 'Invalid credentials' };
      }

      this.clearDemoStorage();
      this.accessToken.set(data.session?.access_token ?? null);
      const profile = await this.loadProfileFromSupabase(data.user.id, data.user.email ?? email);

      if (profile.status === 'suspended') {
        await this.sb.client.auth.signOut();
        this.currentUser.set(null);
        return { ok: false, error: 'Your account has been suspended. Contact Beautiva Concierge.' };
      }

      this.authMode.set('supabase');
      return { ok: true, profile };
    } finally {
      this.loading.set(false);
    }
  }

  async signUp(input: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    role: 'customer' | 'vendor';
    inviteToken?: string;
  }): Promise<AuthActionResult> {
    if (!this.sb.client) {
      return {
        ok: false,
        error: 'Supabase .env keys are not configured yet. Use Demo Quick-Switch below or configure .env.',
      };
    }

    this.loading.set(true);
    try {
      const normalizedEmail = input.email.trim().toLowerCase();
      const { data, error } = await this.sb.client.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            phone: input.phone.trim(),
            requested_role: input.role,
            invite_token: input.inviteToken || null,
          },
        },
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      if (!data.session && data.user) {
        return {
          ok: true,
          needsEmailConfirmation: true,
        };
      }

      if (data.user) {
        this.clearDemoStorage();
        this.accessToken.set(data.session?.access_token ?? null);
        const profile = await this.loadProfileFromSupabase(data.user.id, normalizedEmail);
        this.authMode.set('supabase');
        return { ok: true, profile };
      }

      return { ok: false, error: 'Unable to complete registration.' };
    } finally {
      this.loading.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (this.sb.client && this.authMode() === 'supabase') {
      await this.sb.client.auth.signOut();
    }
    this.clearDemoStorage();
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.authMode.set('guest');
  }

  switchDemoRole(role: UserRole, studioSlug = 'glamour-studio'): UserProfile {
    const presets: Record<UserRole, UserProfile> = {
      super_admin: {
        id: 'demo-super-admin',
        email: environment.superAdminEmails[0] || 'admin@beautiva.ng',
        fullName: 'Beautiva Platform Owner',
        phone: '+234 800 232 8848',
        role: 'super_admin',
        status: 'active',
      },
      vendor: {
        id: 'demo-vendor-owner',
        email: 'hello@glamourstudio.ng',
        fullName: 'Tolu Adeyemi (Studio Owner)',
        phone: '+234 809 412 8801',
        role: 'vendor',
        status: 'active',
      },
      customer: {
        id: 'demo-customer',
        email: 'adaeze.okonkwo@example.com',
        fullName: 'Adaeze Okonkwo',
        phone: '+234 803 441 9021',
        role: 'customer',
        status: 'active',
      },
    };

    const user = presets[role];
    this.currentUser.set(user);
    this.authMode.set('demo');
    this.demoVendorStudioSlug.set(studioSlug);

    if (this.isBrowser) {
      try {
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ user, studioSlug }));
      } catch {
        // Ignore storage error
      }
    }
    return user;
  }

  async lookupInvitation(token: string): Promise<VendorInvitation | null> {
    if (!this.sb.client || !token.trim()) return null;
    const { data, error } = await this.sb.client
      .from('vendor_invitations')
      .select('*')
      .eq('invite_token', token.trim())
      .eq('status', 'pending')
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      email: data.email,
      businessName: data.business_name,
      categorySlug: data.category_slug || 'hairdressers',
      city: data.city || 'Lagos',
      inviteToken: data.invite_token,
      status: data.status,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  }

  private async loadProfileFromSupabase(userId: string, fallbackEmail: string): Promise<UserProfile> {
    if (!this.sb.client) {
      return {
        id: userId,
        email: fallbackEmail,
        fullName: fallbackEmail.split('@')[0],
        phone: '',
        role: 'customer',
        status: 'active',
      };
    }

    const { data } = await this.sb.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      const profile: UserProfile = {
        id: data.id,
        email: data.email,
        fullName: data.full_name || data.email.split('@')[0],
        phone: data.phone || '',
        role: data.role as UserRole,
        status: data.status,
        avatarUrl: data.avatar_url || undefined,
        createdAt: data.created_at,
      };
      this.currentUser.set(profile);
      return profile;
    }

    const isEnvAdmin = environment.superAdminEmails.includes(fallbackEmail.toLowerCase());
    const fallbackProfile: UserProfile = {
      id: userId,
      email: fallbackEmail,
      fullName: fallbackEmail.split('@')[0],
      phone: '',
      role: isEnvAdmin ? 'super_admin' : 'customer',
      status: 'active',
    };
    this.currentUser.set(fallbackProfile);
    return fallbackProfile;
  }

  private clearDemoStorage(): void {
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // Ignore
    }
  }
}
