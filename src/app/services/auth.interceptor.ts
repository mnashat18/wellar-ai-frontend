import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly apiOrigin = this.resolveOrigin(environment.API_URL);
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isApiRequest(req.url)) return next.handle(req);
    // Directus session mode authenticates exclusively with the HttpOnly cookie.
    // Strip legacy caller-supplied Bearer headers so no stale credential is sent.
    const authReq = req.clone({ withCredentials: true, headers: req.headers.delete('Authorization') });
    return next.handle(authReq).pipe(catchError((err) => {
      // Never retry an authenticated write anonymously.
      return throwError(() => err);
    }));
  }
  private isApiRequest(url: string) { if (!this.apiOrigin) return false; try { return new URL(url, typeof window !== 'undefined' ? window.location.origin : this.apiOrigin).origin === this.apiOrigin; } catch { return false; } }
  private resolveOrigin(url: string): string | null { try { return new URL(url).origin; } catch { return null; } }
}
