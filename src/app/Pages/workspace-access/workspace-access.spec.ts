import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import {
  type WorkspaceAccessState,
  WorkspaceAccessService
} from '../../services/workspace-access.service';
import { InviteService } from '../../services/invites';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { WorkspaceCreationService } from '../../services/workspace-creation.service';
import { WorkspaceActivationService } from '../../services/workspace-activation.service';
import { WorkspaceAccessPageComponent } from './workspace-access';

describe('WorkspaceAccessPageComponent', () => {
  let fixture: ComponentFixture<WorkspaceAccessPageComponent>;
  let routerSpy: any;
  let workspaceCreationSpy: any;
  let activateFromMembershipSpy: any;
  let refreshAuthAndWorkspaceContextSpy: any;
  let resolveDestinationStrictSpy: any;
  let startActivationSpy: any;
  let companyContextSnapshot: any;
  let workspaceAccessSpy: any;

  const noWorkspaceState: WorkspaceAccessState = {
    loading: false,
    error: null,
    user: {
      id: 'user-1',
      displayName: 'Owner User',
      email: 'owner@example.com'
    },
    mode: 'no-workspace',
    pendingApplication: null,
    workspaces: [],
    pendingInvites: [],
    selectedInvite: null,
    activeWorkspaces: [],
    employeeWorkspaces: [],
    inactiveWorkspaces: [],
    hasWorkspace: false,
    hasDashboardAccess: false
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    routerSpy = {
      navigateByUrl: vi.fn(() => Promise.resolve(true))
    };
    workspaceCreationSpy = {
      createWorkspace: vi.fn()
    };
    activateFromMembershipSpy = vi.fn(() => Promise.resolve());
    companyContextSnapshot = {
      context: {
        activeBusinessProfileId: null,
        activeBusinessProfileName: null,
        activeMemberRole: null,
        availableCompanies: []
      }
    };
    refreshAuthAndWorkspaceContextSpy = vi.fn(() => Promise.resolve());
    resolveDestinationStrictSpy = vi.fn(() => Promise.resolve('/app/dashboard'));
    startActivationSpy = vi.fn();
    workspaceAccessSpy = {
      loadWorkspaceAccess: () => of(noWorkspaceState),
      openWorkspace: vi.fn(() => of({ ok: true, message: 'Workspace opened.' })),
      claimInviteByToken: () => of({ ok: false, message: 'n/a' }),
      declineInvite: () => of({ ok: false, message: 'n/a' }),
      getPendingInviteToken: () => null,
      setPendingInviteToken: () => undefined,
      clearPendingInviteToken: () => undefined,
      hasClaimAttemptedForToken: () => false,
      consumeInviteClaimError: () => null,
      clearInviteClaimError: () => undefined,
      getInviteTokenFromCurrentUrl: () => null
    };

    await TestBed.configureTestingModule({
      imports: [WorkspaceAccessPageComponent],
      providers: [
        {
          provide: Router,
          useValue: routerSpy
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'returnUrl' ? '/app/workforce' : null)
              }
            }
          }
        },
        {
          provide: AuthService,
          useValue: {
            ensureSessionToken: () => of(true),
            getCurrentUserAfterRestore: () =>
              Promise.resolve({
                id: 'user-1',
                email: 'owner@example.com',
                first_name: 'Owner',
                last_name: 'User'
              }),
            logout: () => undefined
          }
        },
        {
          provide: WorkspaceAccessService,
          useValue: workspaceAccessSpy
        },
        {
          provide: CompanyContextService,
          useValue: {
            activateFromMembership: activateFromMembershipSpy,
            clearActiveWorkspaceContext: () => undefined,
            snapshot: () => companyContextSnapshot
          }
        },
        {
          provide: InviteService,
          useValue: {
            consumeInviteClaimError: () => null,
            getPendingInviteToken: () => null,
            hasClaimAttemptedForToken: () => false,
            clearPendingInviteToken: () => undefined,
            clearClaimAttemptedForToken: () => undefined,
            clearInviteClaimError: () => undefined,
            setPendingInviteToken: () => undefined
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: {
            refreshAuthAndWorkspaceContext: refreshAuthAndWorkspaceContextSpy,
            resolveDestinationStrict: resolveDestinationStrictSpy
          }
        },
        {
          provide: WorkspaceCreationService,
          useValue: workspaceCreationSpy
        },
        {
          provide: WorkspaceActivationService,
          useValue: {
            startActivation: startActivationSpy
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceAccessPageComponent);
  });

  function loadPage(): void {
    fixture.detectChanges();
  }

  async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const startedAt = Date.now();
    while (!predicate()) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('Timed out waiting for asynchronous workspace creation side effects.');
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('renders one clear workspace setup flow for new users', async () => {
    loadPage();
    await fixture.whenStable();

    const cards = fixture.nativeElement.querySelectorAll('.workspace-access-card');
    expect(cards.length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Create Company Workspace');
    expect(fixture.nativeElement.textContent).toContain('Join with an invitation');
    expect(fixture.nativeElement.textContent).toContain('Request organization access');
  });

  it('ignores a workspace creation lock left by a different user in the same browser session', async () => {
    sessionStorage.setItem('wellar_workspace_creation_lock_v1', JSON.stringify({ userId: 'user-2' }));

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();

    expect(component.createCompanyLocked).toBe(false);
    expect(component.createCompanyOpen).toBe(true);
  });

  it('clears workspace loading without navigation or an error for a superseded completion', async () => {
    workspaceAccessSpy.openWorkspace.mockReturnValueOnce(EMPTY);

    await fixture.componentInstance.openWorkspace({
      id: 'profile-1',
      companyName: 'Northwind Logistics',
      memberRole: 'owner',
      departmentId: null
    } as any);

    expect(fixture.componentInstance.switchingWorkspaceId).toBeNull();
    expect(fixture.componentInstance.errorMessage).toBe('');
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  it('clears workspace loading and shows feedback for a confirmed switch failure', async () => {
    workspaceAccessSpy.openWorkspace.mockReturnValueOnce(of({ ok: false, message: 'Workspace access denied.' }));

    await fixture.componentInstance.openWorkspace({
      id: 'profile-1',
      companyName: 'Northwind Logistics',
      memberRole: 'owner',
      departmentId: null
    } as any);

    expect(fixture.componentInstance.switchingWorkspaceId).toBeNull();
    expect(fixture.componentInstance.errorMessage).toBe('Workspace access denied.');
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  it('displays the safe workspace access error returned by the service', async () => {
    workspaceAccessSpy.loadWorkspaceAccess = vi.fn(() => of({
      ...noWorkspaceState,
      mode: 'error',
      error: 'Something went wrong on our end. Please try again later.'
    }));

    loadPage();
    await fixture.whenStable();

    expect(fixture.componentInstance.errorMessage).toBe(
      'Something went wrong on our end. Please try again later.'
    );
    expect(fixture.nativeElement.textContent).not.toContain('DirectusException');
  });

  it('does not navigate to joined state when invite activation cannot be confirmed', async () => {
    workspaceAccessSpy.claimInviteByToken = vi.fn(() => of({
      ok: true,
      message: 'Invite accepted.',
      businessProfileId: 'profile-1',
      memberRole: 'owner',
      departmentId: null
    }));

    const component = fixture.componentInstance;
    component.inviteCode = 'invite-token';
    component.joinWithInviteCode();
    await fixture.whenStable();

    expect(component.inviteCodeError).toBe(
      'Invite accepted, but workspace activation could not be confirmed. Please retry.'
    );
    expect(component.inviteCodeLoading).toBe(false);
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalledWith('/app/workspace-access?joined=1', { replaceUrl: true });
  });

  it('routes a confirmed 201 with workspace.id through workspace activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: true,
        context: {
          workspaceId: 'profile-1',
          businessProfileId: 'profile-1',
          companyName: 'Northwind Logistics',
          isActive: true,
          planCode: 'free',
          billingStatus: 'trialing'
        }
      })
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';
    component.createCompanyForm.phone = '+1 555 010 1234';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(workspaceCreationSpy.createWorkspace).toHaveBeenCalledTimes(1);
    expect(workspaceCreationSpy.createWorkspace.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        company_name: 'Northwind Logistics',
        first_name: 'Jane',
        last_name: 'Owner',
        work_email: 'jane.owner@example.com',
        country: 'Egypt'
      })
    );
    expect(startActivationSpy).toHaveBeenCalledWith({
      businessProfileId: 'profile-1',
      companyName: 'Northwind Logistics'
    });
    expect(activateFromMembershipSpy).not.toHaveBeenCalled();
    expect(refreshAuthAndWorkspaceContextSpy).not.toHaveBeenCalled();
    expect(resolveDestinationStrictSpy).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanyLocked).toBe(true);
    expect(component.createCompanySuccessMessage).toBe('Workspace created. Activating your access...');
  });

  it('routes a confirmed 201 with membership.business_profile_id through workspace activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: true,
        context: {
          workspaceId: 'profile-2',
          businessProfileId: 'profile-2',
          companyName: 'Northwind Logistics',
          isActive: true,
          planCode: 'free',
          billingStatus: 'trialing'
        }
      })
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(startActivationSpy).toHaveBeenCalledWith({
      businessProfileId: 'profile-2',
      companyName: 'Northwind Logistics'
    });
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
  });

  it('confirms a sparse 201 only after refreshed canonical context verifies owner activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: false,
        context: {
          workspaceId: null,
          businessProfileId: null,
          companyName: 'Northwind Logistics',
          isActive: null,
          planCode: null,
          billingStatus: null
        }
      })
    );

    refreshAuthAndWorkspaceContextSpy.mockImplementation(async () => {
      companyContextSnapshot.context = {
        activeBusinessProfileId: 'profile-3',
        activeBusinessProfileName: 'Northwind Logistics',
        activeMemberRole: 'owner',
        availableCompanies: [
          {
            id: 'profile-3',
            isActive: true
          }
        ]
      };
    });

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await waitForCondition(() => routerSpy.navigateByUrl.mock.calls.length > 0);

    expect(refreshAuthAndWorkspaceContextSpy).toHaveBeenCalled();
    expect(startActivationSpy).toHaveBeenCalledWith({
      businessProfileId: 'profile-3',
      companyName: 'Northwind Logistics'
    });
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
    expect(component.createCompanyLocked).toBe(true);
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanySuccessMessage).toBe('Workspace created. Activating your access...');
  });

  it('locks sparse 201 creation when canonical context still cannot confirm activation', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 201,
        confirmed: false,
        context: {
          workspaceId: null,
          businessProfileId: null,
          companyName: 'Northwind Logistics',
          isActive: null,
          planCode: null,
          billingStatus: null
        }
      })
    );

    refreshAuthAndWorkspaceContextSpy.mockImplementation(async () => {
      companyContextSnapshot.context = {
        activeBusinessProfileId: null,
        activeBusinessProfileName: null,
        activeMemberRole: null,
        availableCompanies: []
      };
    });

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await fixture.whenStable();
    await waitForCondition(() => component.createCompanyLocked);

    expect(refreshAuthAndWorkspaceContextSpy).toHaveBeenCalledTimes(4);
    expect(startActivationSpy).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalledWith('/app/workspace-activating', { replaceUrl: true });
    expect(component.createCompanyLocked).toBe(true);
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanySuccessMessage).toBe(
      'Workspace created. Opening your dashboard...'
    );

    component.createCompany();
    expect(workspaceCreationSpy.createWorkspace).toHaveBeenCalledTimes(1);
  });

  it('keeps existing-workspace recovery on the canonical post-create route flow without fabricating membership ids', async () => {
    resolveDestinationStrictSpy.mockResolvedValue('/app/workspace-access');
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      of({
        status: 200,
        confirmed: true,
        context: {
          workspaceId: 'profile-1',
          businessProfileId: 'profile-1',
          companyName: 'Northwind Logistics',
          isActive: true,
          planCode: 'free',
          billingStatus: 'trialing'
        }
      })
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    await fixture.whenStable();

    expect(startActivationSpy).not.toHaveBeenCalled();
    expect(refreshAuthAndWorkspaceContextSpy).toHaveBeenCalledWith({ force: true });
    expect(resolveDestinationStrictSpy).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(component.createCompanyError).toBe('');
    expect(component.createCompanyLocked).toBe(false);
    expect(component.createCompanySuccessMessage).toBe(
      'Your company was created, but access is still activating. Please refresh this page in a moment.'
    );
  });

  it('prevents duplicate submissions while the first request is in flight', async () => {
    const createSubject = new Subject<{ status: number; confirmed: boolean; context: unknown }>();
    workspaceCreationSpy.createWorkspace.mockReturnValue(createSubject.asObservable());

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).toHaveBeenCalledTimes(1);

    createSubject.next({
      status: 201,
      confirmed: true,
      context: {
        workspaceId: 'profile-1',
        businessProfileId: 'profile-1',
        companyName: 'Northwind Logistics',
        isActive: true,
        planCode: 'free',
        billingStatus: 'trialing'
      }
    });
    createSubject.complete();
    await fixture.whenStable();
  });

  it('preserves the draft and shows a safe error code on server failure', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      throwError(() => ({
        status: 500,
        error: {
          code: 'SERVER_ERROR',
          message: 'Database exploded'
        }
      }))
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();

    expect(component.createCompanyLoading).toBe(false);
    expect(component.createCompanyForm.companyName).toBe('Northwind Logistics');
    expect(component.createCompanyErrorCode).toBe('SERVER');
    expect(component.createCompanyError).toBe(
      'Something went wrong on our end. Please try again later.'
    );
    expect(fixture.nativeElement.textContent).not.toContain('SERVER_ERROR');
    expect(fixture.nativeElement.textContent).not.toContain('Database exploded');
  });

  it('preserves the draft and shows a safe error code on network failure', async () => {
    workspaceCreationSpy.createWorkspace.mockReturnValue(
      throwError(() => ({
        status: 0,
        error: null
      }))
    );

    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';

    component.createCompany();
    await fixture.whenStable();

    expect(component.createCompanyLoading).toBe(false);
    expect(component.createCompanyForm.companyName).toBe('Northwind Logistics');
    expect(component.createCompanyErrorCode).toBe('NETWORK');
    expect(component.createCompanyError).toBe(
      'We couldn’t reach the server. Check your connection and try again.'
    );
  });

  it('rejects invalid drafts before calling the backend', async () => {
    loadPage();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = '';
    component.createCompanyForm.firstName = '';
    component.createCompanyForm.lastName = '';
    component.createCompanyForm.workEmail = '';
    component.createCompanyForm.country = '';

    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).not.toHaveBeenCalled();
    expect(component.createCompanyErrorCode).toBe('VALIDATION');
    expect(component.createCompanyError).toBe('Company name is required.');
  });

  it('rejects a phone number with fewer than seven digits before calling the backend', async () => {
    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';
    component.createCompanyForm.phone = '8';

    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).not.toHaveBeenCalled();
    expect(component.createCompanyErrorCode).toBe('VALIDATION');
    expect(component.createCompanyError).toBe('Phone number must include at least 7 digits.');
  });

  it('rejects an unselected country before calling the backend', async () => {
    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = 'Northwind Logistics';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = '';
    component.createCompanyForm.phone = '+1 555 010 1234';

    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).not.toHaveBeenCalled();
    expect(component.createCompanyErrorCode).toBe('VALIDATION');
    expect(component.createCompanyError).toBe('Country is required.');
  });

  it('rejects a digits-only company name before calling the backend', async () => {
    const component = fixture.componentInstance;
    component.openCreateCompany();
    component.createCompanyForm.companyName = '888888';
    component.createCompanyForm.firstName = 'Jane';
    component.createCompanyForm.lastName = 'Owner';
    component.createCompanyForm.workEmail = 'jane.owner@example.com';
    component.createCompanyForm.country = 'Egypt';
    component.createCompanyForm.phone = '+1 555 010 1234';

    component.createCompany();

    expect(workspaceCreationSpy.createWorkspace).not.toHaveBeenCalled();
    expect(component.createCompanyErrorCode).toBe('VALIDATION');
    expect(component.createCompanyError).toBe(
      'Company name must contain letters and be at least 3 characters.'
    );
  });
});
