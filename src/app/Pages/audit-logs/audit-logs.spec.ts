import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuditLogs } from './audit-logs';
import { AuthService } from '../../services/auth';

describe('AuditLogs read access states', () => {
  let component: AuditLogs;
  let fixture: ComponentFixture<AuditLogs>;
  let auth: { getVerifiedCurrentUser: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    auth = {
      getVerifiedCurrentUser: vi.fn().mockReturnValue(of({
        id: 'user-1',
        email: 'user@example.com',
        role: { name: 'Employee' }
      }))
    };

    await TestBed.configureTestingModule({
      imports: [AuditLogs],
      providers: [
        provideHttpClient(),
        { provide: AuthService, useValue: auth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogs);
    component = fixture.componentInstance;
  });

  it('shows explicit permission denial and does not label it as an empty collection', () => {
    vi.spyOn(component as any, 'fetchLogs').mockReturnValue(throwError(() => ({ status: 403 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fixture.detectChanges();

    expect(component.logReadState).toBe('permission_denied');
    expect(fixture.nativeElement.textContent).toContain('does not have permission to read these audit logs');
    expect(fixture.nativeElement.textContent).not.toContain('No audit logs yet.');
  });

  it('keeps a successful empty result distinct from a forbidden result', () => {
    vi.spyOn(component as any, 'fetchLogs').mockReturnValue(of([]));

    fixture.detectChanges();

    expect(component.logReadState).toBe('loaded');
    expect(fixture.nativeElement.textContent).toContain('No audit logs yet.');
    expect(fixture.nativeElement.textContent).not.toContain('does not have permission');
  });

  it('reports an expired or unavailable session separately from forbidden access', () => {
    vi.spyOn(component as any, 'fetchLogs').mockReturnValue(throwError(() => ({ status: 401 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fixture.detectChanges();

    expect(component.logReadState).toBe('authentication_required');
    expect(fixture.nativeElement.textContent).toContain('session is unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('does not have permission');
  });
});
