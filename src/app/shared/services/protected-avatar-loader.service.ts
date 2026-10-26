import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { protectedFileUrl } from '../utils/protected-file-url';

@Injectable({ providedIn: 'root' })
export class ProtectedAvatarLoaderService {
  private objectUrl: string | null = null;
  private avatarId: string | null = null;
  private loadingAvatarId: string | null = null;
  private loadingRequest$: Observable<string | null> | null = null;
  private readonly missingAvatarIds = new Set<string>();

  constructor(private readonly http: HttpClient) {}

  load(avatarId: string | null | undefined): Observable<string | null> {
    const normalizedId = typeof avatarId === 'string' ? avatarId.trim() : '';
    if (!normalizedId) {
      this.clear();
      return of(null);
    }

    if (this.missingAvatarIds.has(normalizedId)) {
      return of(null);
    }

    if (this.avatarId === normalizedId && this.objectUrl) {
      return of(this.objectUrl);
    }

    if (this.loadingAvatarId === normalizedId && this.loadingRequest$) {
      return this.loadingRequest$;
    }

    const url = protectedFileUrl(environment.API_URL, normalizedId);
    if (!url) {
      this.clear();
      return of(null);
    }

    const request$ = this.http.get(url, {
      withCredentials: true,
      responseType: 'blob'
    }).pipe(
      map((blob) => URL.createObjectURL(blob)),
      tap((nextObjectUrl) => {
        this.revokeObjectUrl();
        this.avatarId = normalizedId;
        this.objectUrl = nextObjectUrl;
      }),
      map(() => this.objectUrl),
      catchError((error: { status?: number }) => {
        this.revokeObjectUrl();
        this.avatarId = null;
        if (error?.status === 404) {
          this.missingAvatarIds.add(normalizedId);
        }
        return of(null);
      }),
      finalize(() => {
        if (this.loadingAvatarId === normalizedId) {
          this.loadingAvatarId = null;
          this.loadingRequest$ = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.loadingAvatarId = normalizedId;
    this.loadingRequest$ = request$;
    return request$;
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
