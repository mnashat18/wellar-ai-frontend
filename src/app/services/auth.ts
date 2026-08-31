import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, firstValueFrom, from, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';

type AuthCaptureResult = {
  stored: boolean;
  accessToken?: string;
  refreshToken?: string;
  reason?: string;
  errorDescription?: string;
  hasCode: boolean;
};

type StoredTokens = {
  authenticated: boolean;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.API_URL;
  private readonly refreshEndpointMissingSessionKey = 'auth_refresh_endpoint_missing';
  private readonly loginTimeoutMs = 20000;
  private sessionEstablished = false;
  private sessionCheck$: Observable<boolean> | null = null;
  private logoutInFlight = false;

  constructor(private http: HttpClient) {}

  captureAuthFromUrl(): AuthCaptureResult {
    if (typeof window === 'undefined') {
      return { stored: false, hasCode: false };
    }

    const current = new URL(window.location.href);
    let source = current;

    const hashParams = source.hash ? new URLSearchParams(source.hash.replace('#', '?')) : null;
    const searchParams = source.search ? new URLSearchParams(source.search) : null;
    const currentHashParams = current.hash ? new URLSearchParams(current.hash.replace('#', '?')) : null;
    const currentSearchParams = current.search ? new URLSearchParams(current.search) : null;
    const isAuthCallback = this.isAuthCallbackPath(source.pathname);
    const isCurrentAuthCallback = this.isAuthCallbackPath(current.pathname);
    const isInviteClaim = this.isInviteClaimPath(current.pathname);
    const inviteToken = this.extractInviteTokenFromParams(currentSearchParams, currentHashParams);

    if (isInviteClaim && inviteToken) {
      this.persistPendingInviteToken(inviteToken);
    }

    const hasCode =
      isAuthCallback &&
      (hashParams?.has('code') === true || searchParams?.has('code') === true);


    const reason =
      searchParams?.get('reason') ??
      hashParams?.get('reason') ??
      searchParams?.get('error') ??
      hashParams?.get('error') ??
      undefined;

    const errorDescription =
      searchParams?.get('error_description') ??
      hashParams?.get('error_description') ??
      undefined;

    if (hasCode && !reason && !errorDescription) {
      sessionStorage.setItem('auth_callback_pending', '1');
      sessionStorage.removeItem('auth_refresh_attempted');
    }

    if (reason || errorDescription) {
      sessionStorage.removeItem('auth_callback_pending');
      sessionStorage.removeItem('auth_refresh_attempted');
    }

    if (isAuthCallback && !reason && !errorDescription) sessionStorage.removeItem('auth_callback_pending');

    const hasAuthSignal =
      Boolean(reason) ||
      Boolean(errorDescription) ||
      hasCode;

    if (hasAuthSignal) {
      const cleaned = new URL(window.location.href);
      const dropKeys = [
        'expires',
        'expires_in',
        'state',
        'reason',
        'error',
        'error_description'
      ];
      if (isCurrentAuthCallback) {
        dropKeys.push('token', 'code');
      }
      dropKeys.forEach((key) => cleaned.searchParams.delete(key));
      if (cleaned.hash) {
        cleaned.hash = '';
      }
      const next =
        cleaned.pathname +
        (cleaned.searchParams.toString() ? `?${cleaned.searchParams.toString()}` : '');
      window.history.replaceState({}, document.title, next);
    }

    return {
      stored: false,
      reason,
      errorDescription,
      hasCode
    };
  }

  login(email: string, password: string) {
    return this.http.post<any>(
      `${this.api}/auth/login`,
      {
        email,
        password,
        mode: 'session'
      },
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    ).pipe(
      timeout(this.loginTimeoutMs),
      tap((res) => {
        this.sessionEstablished = true;
        localStorage.setItem('user_email', email);
      }),
      switchMap((res) =>
        this.getCurrentUser().pipe(
          switchMap((user) => user ? of(res) : throwError(() => ({ status: 401 })))
        )
      ),
      catchError((err) => {
        this.storeAuthError(err);
        return throwError(() => err);
      })
    );
  }

  signup(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) {
    return this.http.post(
      `${this.api}/users/register`,
      {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name
      },
      { withCredentials: true }
    );
  }

  requestPasswordReset(email: string) {
    return this.http.post(
      `${this.api}/auth/password/request`,
      {
        email,
        reset_url: environment.PASSWORD_RESET_URL
      },
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    );
  }

  resetPassword(token: string, password: string) {
    return this.http.post(
      `${this.api}/auth/password/reset`,
      {
        token,
        password
      },
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    );
  }

  requestPhoneOtp(phone: string) {
    // Placeholder endpoint for future OTP driver integration.
    return this.http.post(
      `${this.api}/auth/phone/request`,
      { phone },
      { withCredentials: true }
    ).pipe(
      catchError((err) => {
        this.storeAuthError(err);
        return throwError(() => err);
      })
    );
  }

  verifyPhoneOtp(phone: string, otp: string) {
    // Placeholder endpoint; when backend returns auth tokens, they are stored
    // with the same shared logic as email/password and Google.
    return this.http.post<any>(
      `${this.api}/auth/phone/verify`,
      {
        phone,
        otp,
        mode: 'session'
      },
      { withCredentials: true }
    ).pipe(
      tap((res) => this.storeTokensFromAuthResponse(res)),
      switchMap((res) =>
        this.getCurrentUser().pipe(
          map(() => res)
        )
      ),
      catchError((err) => {
        this.storeAuthError(err);
        return throwError(() => err);
      })
    );
  }

  loginWithGoogle() {
    if (typeof window === 'undefined') {
      return;
    }
    sessionStorage.setItem('auth_callback_pending', '1');
    sessionStorage.removeItem('auth_refresh_attempted');
    const params = new URLSearchParams({
      redirect: `${window.location.origin}/auth-callback`,
      mode: 'cookie'
    });
    window.location.href = `${this.api}/auth/login/google?${params.toString()}`;
  }

  setPostAuthRedirect(path: string): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    if (!path || !path.startsWith('/')) {
      return;
    }
    sessionStorage.setItem('post_auth_redirect', path);
  }

  consumePostAuthRedirect(defaultPath = '/dashboard'): string {
    if (typeof sessionStorage === 'undefined') {
      return defaultPath;
    }

    const raw = sessionStorage.getItem('post_auth_redirect');
    sessionStorage.removeItem('post_auth_redirect');

    if (raw && raw.startsWith('/')) {
      return raw;
    }

    return defaultPath;
  }

  refreshFromCookie(): Observable<boolean> {
    return from(this.refreshFromCookieInternal()).pipe(map(Boolean));
  }

  refreshSession() {
    return this.refreshUserFromCookie().pipe(
      map((user) => Boolean(user))
    );
  }

  ensureSessionToken() {
    if (this.sessionEstablished) return of(true);
    if (this.sessionCheck$) return this.sessionCheck$;
    this.sessionCheck$ = this.refreshUserFromCookie().pipe(
      map((user) => { this.sessionEstablished = Boolean(user); return this.sessionEstablished; }),
      catchError(() => { this.sessionEstablished = false; return of(false); }),
      tap(() => { this.sessionCheck$ = null; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.sessionCheck$;
  }

  /** Returns only the last server-verified in-memory session state. */
  isSessionEstablished(): boolean {
    return this.sessionEstablished;
  }

  /** Shared server verification for guards and authenticated initialization. */
  ensureSession(): Observable<boolean> {
    return this.ensureSessionToken();
  }

  getVerifiedCurrentUser(): Observable<any | null> {
    return this.getCurrentUser();
  }

  /** @deprecated Session authentication has no browser-readable access token. */
  getStoredAccessToken(): null {
    return null;
  }

  getCurrentUser(
    accessToken?: string,
    _options?: { hydrateWorkspace?: boolean }
  ): Observable<any | null> {
    return this.fetchCurrentUser(null, accessToken);
  }

  getCurrentUserWithFields(
    fields: string[],
    accessToken?: string
  ): Observable<any | null> {
    return this.fetchCurrentUser(fields, accessToken);
  }

  private fetchCurrentUser(
    fields: string[] | null,
    accessToken?: string
  ): Observable<any | null> {
    const normalizedFields = Array.isArray(fields)
      ? fields.map((field) => String(field ?? '').trim()).filter(Boolean)
      : [];
    const query = normalizedFields.length
      ? `?fields=${encodeURIComponent(normalizedFields.join(','))}`
      : '';

    return this.http.get<any>(
      `${this.api}/users/me${query}`,
      {
        headers: this.getAuthHeaders(accessToken),
        withCredentials: true
      }
    ).pipe(
      timeout(12000),
      map((res) => res?.data ?? null),
      switchMap((user) => {
        if (!user) {
          return of(null);
        }

        sessionStorage.setItem('is_logged_in', '1');
        localStorage.removeItem('auth_error');
        if (typeof user?.email === 'string' && user.email) {
          localStorage.setItem('user_email', user.email);
        }
        const userId =
          typeof user?.id === 'string'
            ? user.id
            : typeof user?.id === 'number' && !Number.isNaN(user.id)
              ? String(user.id)
              : null;
        const orgId =
          typeof user?.org_id === 'string'
            ? user.org_id
            : typeof user?.organization_id === 'string'
              ? user.organization_id
              : typeof user?.organization?.id === 'string'
                ? user.organization.id
                : null;

        if (userId) {
          localStorage.setItem('current_user_id', userId);
        }
        if (orgId) {
          localStorage.setItem('current_user_org_id', orgId);
        } else {
          localStorage.removeItem('current_user_org_id');
        }
        const roleId =
          typeof user?.role === 'string'
            ? user.role
            : typeof user?.role?.id === 'string'
              ? user.role.id
              : null;
        const roleName =
          typeof user?.role?.name === 'string'
            ? user.role.name
            : null;

        if (roleId) {
          localStorage.setItem('user_role_id', roleId);
        }
        if (roleName) {
          localStorage.setItem('user_role_name', roleName);
        }

        this.notifyAuthStateChanged();
        return of(user);
      }),
      catchError((err) => {
        sessionStorage.removeItem('is_logged_in');
        // Invalid/unauthorized token: clear stale auth state so the app
        // does not keep retrying /users/me on every public-page load.
        if (err?.status === 401 || err?.status === 403) {
          this.clearAuthState();
          return of(null);
        }

        this.storeAuthError(err);
        return of(null);
      })
    );
  }

  clearAuthState() {
    this.clearAuthRecoveryState();
    this.clearInviteFlowState();
    sessionStorage.removeItem('post_auth_redirect');
    sessionStorage.removeItem(this.refreshEndpointMissingSessionKey);
    this.notifyAuthStateReset('auth-cleared');
  }

  clearAuthRecoveryState(): void {
    this.sessionEstablished = false;
    localStorage.removeItem('auth_error');
    localStorage.removeItem('user_email');
    localStorage.removeItem('current_user_id');
    localStorage.removeItem('current_user_org_id');
    localStorage.removeItem('user_role_id');
    localStorage.removeItem('user_role_name');
    localStorage.removeItem('wellar_sidebar_business_state_v1');

    sessionStorage.removeItem('is_logged_in');
    sessionStorage.removeItem('auth_callback_pending');
    sessionStorage.removeItem('auth_callback_raw_url');
    sessionStorage.removeItem('auth_refresh_attempted');
    sessionStorage.removeItem('auth_session_established_at');
    sessionStorage.removeItem(this.refreshEndpointMissingSessionKey);
    this.notifyAuthStateReset('auth-recovery-cleared');
  }

  getSafeAuthCallbackFailureNotice(reason?: string | null): string {
    const normalizedReason = String(reason ?? '').trim().toUpperCase();

    if (normalizedReason === 'INVALID_PROVIDER') {
      return 'We couldn’t complete Google sign-in. Try signing in with your password, reset your password, or use a different Google account.';
    }

    return 'We couldn’t complete sign-in. Please try again.';
  }

  getAuthHeaders(accessToken?: string): HttpHeaders {
    void accessToken;
    return new HttpHeaders();
  }

  isLoggedIn(): boolean {
    return this.sessionEstablished;
  }

  logout() {
    if (this.logoutInFlight) return;
    this.logoutInFlight = true;
    this.clearAuthState();

    this.http.post(
      `${this.api}/auth/logout`,
      { mode: 'session' },
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
        withCredentials: true
      }
    ).pipe(
      catchError(() => of(null))
    ).subscribe(() => {
      this.logoutInFlight = false;
    });
  }

  ensureTrialAccess() {
    return of(true);
  }

  async getCurrentUserAfterRestore(): Promise<any | null> {
    try {
      return await firstValueFrom(
        this.getCurrentUser().pipe(
          timeout(16000),
          catchError(() => of(null))
        )
      );
    } catch {
      return null;
    }
  }

  async refreshAuthTokenWithStoredRefreshToken(): Promise<boolean> {
    return Boolean(await this.refreshFromCookieInternal());
  }

  setAuthNotice(message: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_notice', String(message ?? '').trim());
      }
    } catch {
      // ignore storage errors
    }
  }

  consumeAuthNotice(): string | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      const value = localStorage.getItem('auth_notice');
      localStorage.removeItem('auth_notice');
      const normalized = typeof value === 'string' ? value.trim() : '';
      return normalized || null;
    } catch {
      return null;
    }
  }

  private refreshUserFromCookie(): Observable<any | null> {
    return this.refreshFromCookie().pipe(
      switchMap((authenticated) => {
        if (!authenticated) {
          return of(null);
        }
        return this.getCurrentUser();
      })
    );
  }

  private async refreshFromCookieInternal(): Promise<boolean> {
    if (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(this.refreshEndpointMissingSessionKey) === '1'
    ) {
      return false;
    }

    const attempts: Array<Record<string, string>> = [{ mode: 'session' }];

    if (!attempts.length) {
      return false;
    }

    let lastErr: any = null;

    for (const payload of attempts) {
      try {
        const res = await firstValueFrom(
          this.http.post<any>(
            `${this.api}/auth/refresh`,
            payload,
            { withCredentials: true }
          )
        );
        const tokens = this.storeTokensFromAuthResponse(res);
        if (tokens.authenticated) {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(this.refreshEndpointMissingSessionKey);
          }
          sessionStorage.removeItem('auth_callback_pending');
          sessionStorage.removeItem('auth_refresh_attempted');
          return true;
        }
      } catch (err) {
        lastErr = err;
        if (this.isRefreshRouteMissing(err)) {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(this.refreshEndpointMissingSessionKey, '1');
          }
          break;
        }
      }
    }

    this.storeAuthError(lastErr);
    return false;
  }

  private storeTokensFromAuthResponse(res: any): StoredTokens {
    this.sessionEstablished = true;
    localStorage.removeItem('auth_error');
    return { authenticated: true };
  }

  private storeAuthError(err: any) {
    const detail =
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.errors?.[0]?.message ||
      err?.message ||
      'Unable to complete login session.';

    try {
      localStorage.setItem('auth_error', String(detail));
    } catch {
      // ignore storage errors
    }
  }

  private isSameOriginApi(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return new URL(this.api, window.location.origin).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  private isAuthCallbackPath(pathname: string): boolean {
    const normalized = pathname.trim().toLowerCase();
    return normalized === '/auth-callback' || normalized.endsWith('/auth-callback');
  }

  private isInviteClaimPath(pathname: string): boolean {
    const normalized = pathname.trim().toLowerCase();
    return normalized === '/invites/claim' || normalized.endsWith('/invites/claim');
  }

  private extractInviteTokenFromParams(
    searchParams: URLSearchParams | null,
    hashParams: URLSearchParams | null
  ): string | null {
    const token = searchParams?.get('token') ?? hashParams?.get('token');
    const code = searchParams?.get('code') ?? hashParams?.get('code');
    const invite = searchParams?.get('invite') ?? hashParams?.get('invite');

    const normalizedToken = token?.trim() ?? '';
    if (normalizedToken) {
      return normalizedToken;
    }

    const normalizedCode = code?.trim() ?? '';
    if (normalizedCode) {
      return normalizedCode;
    }

    const normalizedInvite = invite?.trim() ?? '';
    if (normalizedInvite && normalizedInvite !== '1') {
      return normalizedInvite;
    }

    return null;
  }

  private persistPendingInviteToken(token: string): void {
    const normalized = token.trim();
    if (!normalized) {
      return;
    }

    try {
      sessionStorage.setItem('pending_invite_token', normalized);
      localStorage.removeItem('pending_invite_token');
    } catch {
      // ignore storage errors
    }
  }


  private notifyAuthStateChanged(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.dispatchEvent(new Event('wellar-auth-state-changed'));
    } catch {
      // ignore browser event errors
    }
  }

  private notifyAuthStateReset(reason: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent('wellar-auth-state-reset', { detail: { reason } }));
    } catch {
      // ignore browser event errors
    }
  }

  private clearInviteFlowState(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pending_invite_token');

      const claimPrefixes = ['invite_claim_success_', 'invite_claim_attempted_'];
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key) {
          continue;
        }

        if (claimPrefixes.some((prefix) => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('pending_invite_token');
      sessionStorage.removeItem('invite_claim_error');
      sessionStorage.removeItem('invite_claim_completed');

      const sessionPrefixes = [
        'invite_claim_in_progress_',
        'invite_claim_attempted_',
        'invite_claim_success_'
      ];
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (!key) {
          continue;
        }

        if (sessionPrefixes.some((prefix) => key.startsWith(prefix))) {
          sessionStorage.removeItem(key);
        }
      }
    }
  }

  private isRefreshRouteMissing(err: any): boolean {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const message = (
      err?.error?.errors?.[0]?.message ||
      err?.error?.errors?.[0]?.extensions?.reason ||
      err?.error?.message ||
      err?.message ||
      ''
    ).toString().toLowerCase();
    const code = (
      err?.error?.errors?.[0]?.extensions?.code ||
      err?.error?.code ||
      ''
    ).toString().toUpperCase();

    if (code === 'ROUTE_NOT_FOUND') {
      return true;
    }

    if ((status === 400 || status === 404) && message.includes('/auth/refresh') && message.includes('doesn')) {
      return true;
    }

    return false;
  }
}
