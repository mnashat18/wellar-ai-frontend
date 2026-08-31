import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('adds cookie credentials to Directus requests', () => {
    http.get('https://dash.conntinuity.com/users/me').subscribe();
    const request = httpMock.expectOne('https://dash.conntinuity.com/users/me');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: { id: 'user-1' } });
  });

  it('removes stale Authorization headers without constructing a replacement', () => {
    http.get('https://dash.conntinuity.com/users/me', { headers: { Authorization: 'Bearer stale' } }).subscribe();
    const request = httpMock.expectOne('https://dash.conntinuity.com/users/me');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: { id: 'user-1' } });
  });

  it('does not force credentials onto external requests', () => {
    http.get('https://example.com/health').subscribe();
    const request = httpMock.expectOne('https://example.com/health');
    expect(request.request.withCredentials).toBe(false);
    request.flush({ ok: true });
  });

  it('preserves query parameters and request body', () => {
    http.post('https://dash.conntinuity.com/items/events?limit=1', { value: 'ok' }).subscribe();
    const request = httpMock.expectOne('https://dash.conntinuity.com/items/events?limit=1');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ value: 'ok' });
    request.flush({ data: { id: 'event-1' } });
  });
});
