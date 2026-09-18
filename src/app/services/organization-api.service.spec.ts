import { HttpHeaders } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { OrganizationApiError, OrganizationApiService } from './organization-api.service';

describe('OrganizationApiService department contracts', () => {
  let service: OrganizationApiService;
  let httpMock: HttpTestingController;

  const authStub = {
    getStoredAccessToken: () => 'access-token',
    getAuthHeaders: () => new HttpHeaders({ Authorization: 'Bearer access-token' })
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OrganizationApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub }
      ]
    });

    service = TestBed.inject(OrganizationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('POSTs department creation with manager_member_id null when no manager is selected', () => {
    service.createDepartment({ name: 'Operations' }).subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Operations',
      manager_member_id: null
    });

    request.flush({
      data: {
        department: {
          id: 'department-1',
          name: 'Operations',
          is_active: true,
          business_profile: 'profile-1',
          manager_member_id: null
        }
      }
    });
  });

  it('PATCHes department updates with the selected manager membership id', () => {
    service.updateDepartment('department-1', {
      name: 'Operations',
      manager_member_id: 'member-manager'
    }).subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments/department-1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      name: 'Operations',
      manager_member_id: 'member-manager'
    });

    request.flush({
      data: {
        department: {
          id: 'department-1',
          name: 'Operations',
          is_active: true,
          business_profile: 'profile-1',
          manager_member_id: 'member-manager'
        }
      }
    });
  });

  it('posts deactivation through the protected department deactivate endpoint', () => {
    service.deactivateDepartment('department-1').subscribe();

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/departments/department-1/deactivate`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});

    request.flush({
      data: {
        department: {
          id: 'department-1',
          name: 'Operations',
          is_active: false,
          business_profile: 'profile-1',
          manager_member_id: 'member-manager'
        }
      }
    });
  });

  it('sanitizes backend permission messages', () => {
    let failure: OrganizationApiError | undefined;
    service.updateProfile({ company_name: 'Northwind' }).subscribe({
      error: (error: OrganizationApiError) => failure = error
    });

    const request = httpMock.expectOne(`${environment.API_URL}/wellar/organization/profile`);
    request.flush({ error: { message: 'DirectusException SQL permission detail' } }, {
      status: 403,
      statusText: 'Forbidden'
    });

    expect(failure?.code).toBe('forbidden');
    expect(failure?.userMessage).toBe('You do not have permission for this organization action.');
    expect(failure?.userMessage).not.toContain('DirectusException');
  });

  it('preserves timeout as a distinct typed failure', async () => {
    vi.useFakeTimers();
    try {
      let failure: OrganizationApiError | undefined;
      service.updateProfile({ company_name: 'Northwind' }).subscribe({
        error: (error: OrganizationApiError) => failure = error
      });

      httpMock.expectOne(`${environment.API_URL}/wellar/organization/profile`);
      await vi.advanceTimersByTimeAsync(12000);

      expect(failure?.code).toBe('timeout');
      expect(failure?.userMessage).toBe('The request took too long. Please try again.');
    } finally {
      vi.useRealTimers();
    }
  });
});
