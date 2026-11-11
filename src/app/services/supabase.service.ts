import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly url = (environment.supabaseUrl || '').trim();
  readonly anonKey = (environment.supabaseAnonKey || '').trim();
  readonly isConfigured = Boolean(this.url && this.anonKey);

  readonly client: SupabaseClient | null = this.isConfigured
    ? createClient(this.url, this.anonKey, {
        auth: {
          persistSession: this.isBrowser,
          autoRefreshToken: this.isBrowser,
          detectSessionInUrl: this.isBrowser,
        },
      })
    : null;

  /**
   * Uploads an image to Supabase Storage bucket `beautiva-media`, or falls back
   * to a base64 Data URL when running offline / in demo mode.
   */
  async uploadImage(file: File, folder: string): Promise<string> {
    if (this.client && this.isBrowser) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `${folder}/${safeName}`;

      const { error } = await this.client.storage
        .from('beautiva-media')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (!error) {
        const { data } = this.client.storage.from('beautiva-media').getPublicUrl(filePath);
        if (data?.publicUrl) {
          return data.publicUrl;
        }
      }
    }

    return this.readFileAsDataUrl(file);
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read image file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }
}

