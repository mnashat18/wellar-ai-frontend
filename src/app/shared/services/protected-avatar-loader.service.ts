import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { protectedFileUrl } from '../utils/protected-file-url';

@Injectable({ providedIn: 'root' })
export class ProtectedAvatarLoaderService {
  private objectUrl: string | null = null;
  private avatarId: string | null = null;

  constructor(private readonly http: HttpClient) {}

  load(avatarId: string | null | undefined): Observable<string | null> {
    const normalizedId = typeof avatarId === 'string' ? avatarId.trim() : '';
    if (!normalizedId) {
      this.clear();
      return of(null);
    }

    if (this.avatarId === normalizedId && this.objectUrl) {
      return of(this.objectUrl);
    }

    const url = protectedFileUrl(environment.API_URL, normalizedId);
    if (!url) {
      this.clear();
      return of(null);
    }

    return this.http.get(url, {
      withCredentials: true,
      responseType: 'blob'
    }).pipe(
      map((blob) => URL.createObjectURL(blob)),
      tap((nextObjectUrl) => {
        this.revokeObjectUrl();
        this.avatarId = normalizedId;
        this.objectUrl = nextObjectUrl;
      }),
      catchError(() => {
        this.revokeObjectUrl();
        this.avatarId = null;
        return of(null);
      })
    );
  }

  clear(): void {
    this.revokeObjectUrl();
    this.avatarId = null;
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
