import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { InviteService } from './invites';

describe('InviteService invitation actions', () => {
  let service: InviteService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        InviteService,
        { provide: AuthService, useValue: { ensureSession: vi.fn(() => of(true)) } }
      ]
    }).compileComponents();

    service = TestBed.inject(InviteService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads invite details through the canonical in-app invite route', () => {
    service.getInvite('invite-1').subscribe((invite) => {
      expect(invite.id).toBe('invite-1');
      expect(invite.canAct).toBe(true);
    });

    const req = httpMock.expectOne((request) =>
      request.urlWithParams.startsWith(`${environment.API_URL}/wellar/workspaces/invites/invite-1?_ts=`)
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'invite-1',
        email: 'new.person@example.com',
        inviteType: 'in_app',
        status: 'pending',
        memberRole: 'manager',
        businessProfileId: 'profile-1',
        companyName: 'Northwind Logistics',
        departmentId: 'department-1',
        departmentName: 'Operations',
        expiresAt: '2026-07-03T00:00:00.000Z',
        requestedByUser: {
          id: 'user-1',
          email: 'owner@example.com',
          displayName: 'Owner User'
        },
        canAct: true
      }
    });
  });

  it('accepts canonical invite details when email is omitted from the response payload', () => {
    service.getInvite('invite-1').subscribe((invite) => {
      expect(invite.id).toBe('invite-1');
      expect(invite.email).toBeNull();
      expect(invite.companyName).toBe('Waller Demo Company');
      expect(invite.status).toBe('pending');
    });

    const req = httpMock.expectOne((request) =>
      request.urlWithParams.startsWith(`${environment.API_URL}/wellar/workspaces/invites/invite-1?_ts=`)
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'invite-1',
        inviteType: 'in_app',
        status: 'pending',
        memberRole: 'manager',
        companyName: 'Waller Demo Company',
        departmentName: 'hala wallah',
        canAct: true
      }
    });
  });

  it('accepts invitations through the protected accept endpoint', () => {
    service.acceptInvite('invite-1').subscribe((response) => {
      expect(response.ok).toBe(true);
      expect(response.membershipId).toBe('membership-1');
    });

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites/invite-1/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      data: {
        ok: true,
        message: 'Invitation accepted. The organization is now available in Profile → Switch Organization.',
        inviteId: 'invite-1',
        businessProfileId: 'profile-1',
        membershipId: 'membership-1',
        memberRole: 'manager',
        departmentId: 'department-1',
        inviteType: 'in_app',
        status: 'claimed',
        canAct: false
      }
    });
  });

  it('declines invitations through the protected decline endpoint', () => {
    service.declineInvite('invite-1').subscribe((response) => {
      expect(response.ok).toBe(true);
      expect(response.status).toBe('revoked');
    });

    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites/invite-1/decline`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      data: {
        ok: true,
        message: 'Invitation declined.',
        inviteId: 'invite-1',
        businessProfileId: 'profile-1',
        membershipId: null,
        memberRole: 'manager',
        departmentId: 'department-1',
        inviteType: 'in_app',
        status: 'revoked',
        canAct: false
      }
    });
  });

  it.each([
    [{ status: 404, error: { message: 'SQL invite lookup failed' } }, 'Invite not found.'],
    [{ status: 410, error: { message: 'invite expired because of internal rule' } }, 'Invite expired.'],
    [{ status: 409, error: { message: 'invite already claimed by another transaction' } }, 'Invite already used.'],
    [{ status: 409, error: { message: 'user is already a member of workspace' } }, 'You are already a member of this workspace.'],
    [{ status: 401, error: { message: 'Directus authentication exception' } }, 'This invite was sent to another email.'],
    [{ status: 403, error: { message: 'permission denied by database policy' } }, 'This invite was sent to another email.'],
    [{ status: 500, error: { message: 'SQLSTATE backend exception' } }, 'Something went wrong on our end. Please try again later.'],
    [{ status: 0 }, 'We couldn’t reach the server. Check your connection and try again.'],
    [{ name: 'TimeoutError', message: 'Timeout has occurred' }, 'The request took too long. Please try again.']
  ])('maps invite failure safely: %j', (error, expected) => {
    const message = service.getReadableInviteError(error);
    expect(message).toBe(expected);
    expect(message).not.toContain('SQL');
    expect(message).not.toContain('Directus');
    expect(message).not.toContain('database');
  });

  it('keeps invalid and missing invite messages safe', () => {
    expect(service.getReadableInviteError(new Error('Invite token is missing.'))).toBe('Invite token is missing.');
    expect(service.getReadableInviteError(new Error('invalid invitation token'))).toBe('Invite not found.');
  });

  it('does not expose raw backend details through the public detail helper', () => {
    const detail = service.extractInviteErrorDetail({
      status: 500,
      error: { message: 'SQLSTATE 23505: internal Directus exception' }
    });

    expect(detail).toBe('Something went wrong on our end. Please try again later.');
    expect(detail).not.toContain('SQLSTATE');
    expect(detail).not.toContain('Directus');
  });

  it('returns a typed safe failure from invite actions', async () => {
    let capturedError: unknown = null;

    service.acceptInvite('invite-failure').subscribe({ error: (error) => { capturedError = error; } });
    const req = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/invites/invite-failure/accept`);
    req.flush({ error: { message: 'SQLSTATE internal Directus exception' } }, { status: 500, statusText: 'Server Error' });
    await Promise.resolve();

    expect((capturedError as { isClaimInviteError: boolean }).isClaimInviteError).toBe(true);
    expect((capturedError as Error).message).toBe('Something went wrong on our end. Please try again later.');
    expect((capturedError as { detail: string }).detail).toBe('Something went wrong on our end. Please try again later.');
    expect((capturedError as { error?: unknown }).error).toBeUndefined();
  });

  it('times out a pending invite detail request', async () => {
    let capturedError: unknown = null;
    vi.useFakeTimers();

    try {
      service.getInvite('invite-timeout').subscribe({ error: (error) => { capturedError = error; } });
      httpMock.expectOne((request) => request.urlWithParams.startsWith(`${environment.API_URL}/wellar/workspaces/invites/invite-timeout?_ts=`));
      await vi.advanceTimersByTimeAsync(15001);
      expect((capturedError as Error).message).toBe('The request took too long. Please try again.');
    } finally {
      vi.useRealTimers();
    }
  });
});
