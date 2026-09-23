import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { CompanyContextService } from './company-context.service';
import { AuthService } from '../../services/auth';
import { WorkspaceContextApiService } from '../../services/workspace-context-api.service';

describe('CompanyContextService canonical organization context', () => {
  let service: CompanyContextService;
  let httpMock: HttpTestingController;
  let storedAccessToken: string;
  let authGeneration = 0;

  const settleAsync = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    localStorage.clear();
    storedAccessToken = 'access-token';
    authGeneration = 0;

    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CompanyContextService,
        WorkspaceContextApiService,
        {
          provide: AuthService,
          useValue: {
            getStoredAccessToken: vi.fn(() => storedAccessToken),
            getCurrentUserAfterRestore: vi.fn(() =>
              Promise.resolve({
                id: 'user-1',
                email: 'owner@example.com',
                first_name: 'Avery',
                last_name: 'Owner'
              })
            ),
            isLoggedIn: vi.fn(() => true),
            isSessionEstablished: vi.fn(() => true),
            getAuthGeneration: vi.fn(() => authGeneration),
            isAuthGenerationCurrent: vi.fn((generation: number) => generation === authGeneration),
            ensureSession: vi.fn(() => of(true)),
            clearAuthState: vi.fn(),
          }
        }
      ]
    }).compileComponents();

    service = TestBed.inject(CompanyContextService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('does not let an incomplete context publish erase the hydrated phone', () => {
    service.publishCurrentUser({
      id: 'user-1',
      email: 'owner@example.com',
      first_name: 'Avery',
      last_name: 'Owner',
      phone: '+201018320789',
      avatar: null
    });

    service.publishCurrentUser({
      id: 'user-1',
      email: 'owner@example.com',
      first_name: 'Avery',
      last_name: 'Owner',
      phone: null,
      avatar: null
    });

    expect(service.snapshot().context.currentUser?.phone).toBe('+201018320789');
  });

  it('refreshCurrentUser preserves auth and workspace refresh for an established session', async () => {
    const auth = TestBed.inject(AuthService) as any;
    const restored = vi.spyOn(service, 'restoreWorkspaceContext').mockReturnValue(of({
      state: service.snapshot(),
      workspaceContext: null,
      memberships: [],
      verifiedContext: null
    }));
    await service.refreshCurrentUser({ force: false });
    expect(auth.ensureSession).not.toHaveBeenCalled();
    expect(restored).toHaveBeenCalledWith(false);
  });

  it('restores an unavailable session before refreshing current user context', async () => {
    const auth = TestBed.inject(AuthService) as any;
    auth.isSessionEstablished.mockReturnValue(false);
    auth.ensureSession.mockReturnValue(of(false));
    const restored = vi.spyOn(service, 'restoreWorkspaceContext');
    await service.refreshCurrentUser();
    expect(auth.ensureSession).toHaveBeenCalledTimes(1);
    expect(restored).toHaveBeenCalledWith(true);
  });

  it('fails closed when session restoration is unavailable', async () => {
    const auth = TestBed.inject(AuthService) as any;
    auth.isSessionEstablished.mockReturnValue(false);
    auth.ensureSession.mockReturnValue(of(false));
    const loaded = vi.spyOn(service, 'ensureLoaded');
    await service.refreshCurrentUser();
    expect(loaded).not.toHaveBeenCalled();
  });

  it('shares one restoration request with concurrent callers', async () => {
    const first = firstValueFrom(service.restoreWorkspaceContext(true));
    const second = firstValueFrom(service.restoreWorkspaceContext(true));
    await settleAsync();

    const contextRequest = httpMock.expectOne((req) => req.url.includes('/wellar/workspaces/context'));
    contextRequest.flush({ data: { active: null, memberships: [], invitations: [] } });
    await settleAsync();

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    userRequest.flush({ data: { id: 'user-1', email: 'owner@example.com', first_name: 'Avery', last_name: 'Owner', active_business_profile: null, active_department: null, active_member_role: null } });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.state.context.userId).toBe('user-1');
    expect(secondResult).toBe(firstResult);
    httpMock.expectNone((req) => req.url.includes('/wellar/workspaces/context') && req !== contextRequest.request);
  });

  it('ignores a restoration response that completes after reset', async () => {
    const restoration = firstValueFrom(service.restoreWorkspaceContext(true));
    await settleAsync();

    const contextRequest = httpMock.expectOne((req) => req.url.includes('/wellar/workspaces/context'));
    contextRequest.flush({ data: { active: null, memberships: [], invitations: [] } });
    await settleAsync();

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    authGeneration += 1;
    service.reset();
    userRequest.flush({ data: { id: 'old-user', email: 'old@example.com' } });
    await restoration;

    expect(service.snapshot().context.userId).toBeNull();
    expect(service.snapshot().context.currentUser).toBeNull();
    expect(service.snapshot().context.activeBusinessProfileId).toBeNull();
    expect(localStorage.getItem('user_email')).toBeNull();
    expect(localStorage.getItem('current_user_id')).toBeNull();
  });

  it('maps two active memberships from the canonical context into availableCompanies and makes no collection read', async () => {
    localStorage.setItem('active_workspace_membership_sync_v1', 'membership-1');
    const statePromise = firstValueFrom(service.ensureLoaded(true));
    await settleAsync();

    const syncRequest = httpMock.expectOne((req) => req.url.includes('/wellar/workspaces/context'));
    syncRequest.flush({ data: { active: { workspace: { id: 'profile-1', companyName: 'Waller Demo Company', isActive: true, planCode: null, billingStatus: null }, membership: { id: 'membership-1', status: 'active', memberRole: 'owner' }, department: null }, memberships: [
      { id: 'membership-1', status: 'active', memberRole: 'owner', workspace: { id: 'profile-1', companyName: 'Waller Demo Company', isActive: true, planCode: null, billingStatus: null }, department: { id: 'department-1', name: 'All departments' } },
      { id: 'membership-2', status: 'active', memberRole: 'manager', workspace: { id: 'profile-2', companyName: 'Northline Logistics', isActive: true, planCode: null, billingStatus: null }, department: { id: 'department-2', name: 'Operations' } }
    ], invitations: [] } });
    await settleAsync();

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    expect(userRequest.request.method).toBe('GET');
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-1',
        active_department: null,
        active_member_role: 'owner'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    expect(profileRequest.request.method).toBe('GET');
    profileRequest.flush({
      data: [
        {
          id: 'profile-1',
          company_name: 'Waller Demo Company',
          is_active: true,
          plan_code: null,
          billing_status: null,
          timezone: null,
          default_language: null
        }
      ]
    });

    const state = await statePromise;

    expect(state.context.availableCompanies).toHaveLength(2);
    expect(state.context.availableCompanies.map((company) => company.name)).toEqual([
      'Northline Logistics',
      'Waller Demo Company'
    ]);
    expect(state.context.availableCompanies.find((company) => company.id === 'profile-2')?.membershipId).toBe('membership-2');
    expect(state.context.availableCompanies.find((company) => company.id === 'profile-2')?.departmentName).toBe('Operations');
    expect(state.context.availableCompanies.some((company) => company.isActive)).toBe(true);
    httpMock.expectNone((req) => req.url.includes('/items/business_profile_members'));
  });

  it('marks only the canonical active membership as current even when other memberships remain active', async () => {
    localStorage.setItem('active_workspace_membership_sync_v1', 'membership-2');
    const statePromise = firstValueFrom(service.ensureLoaded(true));
    await settleAsync();

    const syncRequest = httpMock.expectOne((req) => req.url.includes('/wellar/workspaces/context'));
    syncRequest.flush({ data: { active: { workspace: { id: 'profile-2', companyName: 'Northline Logistics', isActive: true, planCode: null, billingStatus: null }, membership: { id: 'membership-2', status: 'active', memberRole: 'manager' }, department: { id: 'department-2', name: 'Operations' } }, memberships: [
      { id: 'membership-1', status: 'active', memberRole: 'owner', workspace: { id: 'profile-1', companyName: 'Waller Demo Company', isActive: true, planCode: null, billingStatus: null }, department: { id: 'department-1', name: 'All departments' } },
      { id: 'membership-2', status: 'active', memberRole: 'manager', workspace: { id: 'profile-2', companyName: 'Northline Logistics', isActive: true, planCode: null, billingStatus: null }, department: { id: 'department-2', name: 'Operations' } }
    ], invitations: [] } });
    await settleAsync();

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    expect(userRequest.request.method).toBe('GET');
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-2',
        active_department: null,
        active_member_role: 'manager'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    expect(profileRequest.request.method).toBe('GET');
    profileRequest.flush({ data: [] });

    const state = await statePromise;

    expect(state.context.availableCompanies.find((company) => company.id === 'profile-1')?.isActive).toBe(false);
    expect(state.context.availableCompanies.find((company) => company.id === 'profile-2')?.isActive).toBe(true);
    expect(state.context.availableCompanies.filter((company) => company.isActive)).toHaveLength(1);
    expect(state.context.activeBusinessProfileId).toBe('profile-2');
    expect(state.context.activeMemberRole).toBe('manager');
  });

  it('synchronizes the active membership through switch and token refresh before the first authenticated load', async () => {
    const statePromise = firstValueFrom(service.ensureLoaded(true));
    await settleAsync();

    const syncContextRequest = httpMock.expectOne((req) =>
      req.url.includes('/wellar/workspaces/context')
    );
    expect(syncContextRequest.request.method).toBe('GET');
    syncContextRequest.flush({
      data: {
        active: {
          workspace: {
            id: 'profile-1',
            companyName: 'Waller Demo Company',
            isActive: true,
            planCode: null,
            billingStatus: null
          },
          membership: {
            id: 'membership-1',
            status: 'active',
            memberRole: 'owner'
          },
          department: null
        },
        memberships: [
          {
            id: 'membership-1',
            status: 'active',
            memberRole: 'owner',
            workspace: {
              id: 'profile-1',
              companyName: 'Waller Demo Company',
              isActive: true,
              planCode: null,
              billingStatus: null
            },
            department: null
          },
          {
            id: 'membership-2',
            status: 'active',
            memberRole: 'manager',
            workspace: {
              id: 'profile-2',
              companyName: 'Northline Logistics',
              isActive: true,
              planCode: null,
              billingStatus: null
            },
            department: {
              id: 'department-2',
              name: 'Operations'
            }
          }
        ],
        invitations: []
      }
    });

    await settleAsync();

    const switchRequest = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/switch`);
    expect(switchRequest.request.method).toBe('POST');
    expect(switchRequest.request.body).toEqual({ membership_id: 'membership-1' });
    switchRequest.flush({
      data: {
        workspace: {
          id: 'profile-1',
          companyName: 'Waller Demo Company',
          isActive: true,
          planCode: null,
          billingStatus: null
        },
        membership: {
          id: 'membership-1',
          status: 'active',
          memberRole: 'owner'
        },
        department: null
      }
    });

    await settleAsync();

    await settleAsync();

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-1',
        active_department: null,
        active_member_role: 'owner'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    profileRequest.flush({
      data: [
        {
          id: 'profile-1',
          company_name: 'Waller Demo Company',
          is_active: true,
          plan_code: null,
          billing_status: null,
          timezone: null,
          default_language: null
        }
      ]
    });

    const state = await statePromise;
    expect(state.context.activeBusinessProfileId).toBe('profile-1');
    expect(state.context.activeMemberRole).toBe('owner');
    expect(state.context.availableCompanies).toHaveLength(2);

    const repeatedState = await firstValueFrom(service.ensureLoaded(false));
    expect(repeatedState.context.activeBusinessProfileId).toBe('profile-1');
    httpMock.expectNone((req) => req.url === `${environment.API_URL}/wellar/workspaces/switch`);
  });

  it('refreshes the token before reloading canonical context when switching organizations', async () => {
    (service as any).stateSubject.next({
      loading: false,
      error: null,
      context: {
        currentUser: {
          id: 'user-1',
          email: 'owner@example.com',
          first_name: 'Avery',
          last_name: 'Owner'
        },
        userId: 'user-1',
        userDisplayName: 'Avery Owner',
        userEmail: 'owner@example.com',
        isAuthenticated: true,
        authInitialized: true,
        workspaceInitialized: true,
        activeBusinessProfileId: 'profile-1',
        activeBusinessProfileName: 'Waller Demo Company',
        activeDepartmentId: null,
        activeDepartmentName: null,
        activeMemberRole: 'owner',
        availableCompanies: [
          {
            id: 'profile-1',
            membershipId: 'membership-1',
            name: 'Waller Demo Company',
            role: 'owner',
            membershipStatus: 'active',
            departmentName: 'All departments',
            isActive: true
          },
          {
            id: 'profile-2',
            membershipId: 'membership-2',
            name: 'Northline Logistics',
            role: 'hr',
            membershipStatus: 'active',
            departmentName: 'Marketing',
            isActive: false
          }
        ],
        hubReason: null
      }
    });

    const statePromise = firstValueFrom(service.switchCompany('profile-2'));
    await settleAsync();

    const switchRequest = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/switch`);
    expect(switchRequest.request.body).toEqual({ membership_id: 'membership-2' });
    switchRequest.flush({
      data: {
        workspace: {
          id: 'profile-2',
          companyName: 'Northline Logistics',
          isActive: true,
          planCode: null,
          billingStatus: null
        },
        membership: {
          id: 'membership-2',
          status: 'active',
          memberRole: 'hr'
        },
        department: {
          id: 'department-2',
          name: 'Marketing'
        }
      }
    });

    await settleAsync();

    const contextRequest = httpMock.expectOne((req) => req.url.includes('/wellar/workspaces/context'));
    contextRequest.flush({
      data: {
        active: { workspace: { id: 'profile-2', companyName: 'Northline Logistics', isActive: true }, membership: { id: 'membership-2', status: 'active', memberRole: 'hr' }, department: { id: 'department-2', name: 'Marketing' } },
        memberships: [
          { id: 'membership-1', status: 'active', memberRole: 'owner', workspace: { id: 'profile-1', companyName: 'Waller Demo Company', isActive: true }, department: null },
          { id: 'membership-2', status: 'active', memberRole: 'hr', workspace: { id: 'profile-2', companyName: 'Northline Logistics', isActive: true }, department: { id: 'department-2', name: 'Marketing' } }
        ],
        invitations: []
      }
    });
    await settleAsync();

    const userRequest = httpMock.expectOne((req) => req.url.includes('/users/me'));
    userRequest.flush({
      data: {
        id: 'user-1',
        email: 'owner@example.com',
        first_name: 'Avery',
        last_name: 'Owner',
        active_business_profile: 'profile-2',
        active_department: 'department-2',
        active_member_role: 'hr'
      }
    });

    const profileRequest = httpMock.expectOne((req) => req.url.includes('/items/business_profiles'));
    profileRequest.flush({
      data: [
        {
          id: 'profile-2',
          company_name: 'Northline Logistics',
          is_active: true,
          plan_code: null,
          billing_status: null,
          timezone: null,
          default_language: null
        }
      ]
    });

    const departmentRequest = httpMock.expectOne((req) => req.url.includes('/items/departments'));
    departmentRequest.flush({ data: [{ id: 'department-2', name: 'Marketing' }] });

    await settleAsync();
    const state = await statePromise;
    expect(state.context.activeBusinessProfileId).toBe('profile-2');
    expect(state.context.activeMemberRole).toBe('hr');
    expect(state.context.availableCompanies.map((company) => company.id)).toEqual(['profile-2', 'profile-1']);
  });

  it('serializes rapid switches and commits only the latest selection', async () => {
    (service as any).stateSubject.next({
      ...service.snapshot(),
      context: {
        ...service.snapshot().context,
        availableCompanies: [
          { id: 'profile-a', membershipId: 'membership-a', name: 'A', role: 'owner', membershipStatus: 'active', isActive: true },
          { id: 'profile-b', membershipId: 'membership-b', name: 'B', role: 'owner', membershipStatus: 'active', isActive: false },
          { id: 'profile-c', membershipId: 'membership-c', name: 'C', role: 'owner', membershipStatus: 'active', isActive: false }
        ]
      }
    });

    let releaseA!: () => void;
    let releaseC!: () => void;
    const switchA = new Promise<void>((resolve) => (releaseA = resolve));
    const switchC = new Promise<void>((resolve) => (releaseC = resolve));
    const execute = vi.spyOn(service as any, 'executeMembershipSwitch').mockImplementation(
      async (...args: any[]) => {
        const [membershipId, _label, isCurrent] = args as [string, string, () => boolean];
        if (membershipId === 'membership-a') {
          await switchA;
        }
        if (membershipId === 'membership-c') {
          await switchC;
        }
        if (isCurrent()) {
          (service as any).stateSubject.next({
            ...service.snapshot(),
            context: {
              ...service.snapshot().context,
              activeBusinessProfileId: membershipId.replace('membership-', 'profile-')
            }
          });
        }
        return service.snapshot();
      }
    );

    const first = firstValueFrom(service.switchCompany('profile-a')).catch(() => null);
    await settleAsync();
    const second = firstValueFrom(service.switchCompany('profile-b')).catch(() => null);
    const third = firstValueFrom(service.switchCompany('profile-c')).catch(() => null);

    await settleAsync();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('membership-a', 'Workspace switch', expect.any(Function));

    releaseA();
    for (let i = 0; i < 10; i += 1) {
      await settleAsync();
    }
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith('membership-c', 'Workspace switch', expect.any(Function));

    releaseC();
    await Promise.all([first, second, third]);

    expect(service.snapshot().context.activeBusinessProfileId).toBe('profile-c');
  });

  it('propagates a rejected switch instead of emitting a failed state as success', async () => {
    (service as any).stateSubject.next({
      ...service.snapshot(),
      context: {
        ...service.snapshot().context,
        availableCompanies: [
          { id: 'profile-fail', membershipId: 'membership-fail', name: 'Failed', role: 'owner', membershipStatus: 'active', isActive: false }
        ]
      }
    });

    const switchPromise = firstValueFrom(service.switchCompany('profile-fail'));
    await settleAsync();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/workspaces/switch`);
    request.flush({ error: { code: 'FORBIDDEN', message: 'Switch rejected.' } }, { status: 403, statusText: 'Forbidden' });

    await expect(switchPromise).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(localStorage.getItem('active_business_profile_id')).toBeNull();
  });

  it('sanitizes mutation failures before publishing them in shared context state', async () => {
    const result = await firstValueFrom((service as any).handleMutationError(
      {
        status: 500,
        error: { message: 'SQL connection string leaked' },
        message: 'DirectusException: database unavailable'
      },
      'Unable to update organization context.'
    )) as { error: string | null };

    expect(result.error).toBe('Something went wrong on our end. Please try again later.');
    expect(result.error).not.toContain('SQL');
    expect(result.error).not.toContain('Directus');
  });
});
