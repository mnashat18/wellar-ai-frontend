import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import type { CompanyContextState } from '../core/context/company-context.service';
import { NotificationsService } from './notifications.service';
import { CompanyContextService } from '../core/context/company-context.service';

const readyContext = (): CompanyContextState['context'] => ({
  currentUser: {
    id: 'user-1',
    email: 'owner@example.com',
    first_name: 'Owner',
    last_name: 'User'
  },
  userId: 'user-1',
  userDisplayName: 'Owner User',
  userEmail: 'owner@example.com',
  isAuthenticated: true,
  authInitialized: true,
  workspaceInitialized: true,
  activeBusinessProfileId: 'profile-1',
  activeBusinessProfileName: 'Northwind Logistics',
  activeDepartmentId: null,
  activeDepartmentName: null,
  activeMemberRole: 'owner',
  availableCompanies: [],
  hubReason: null
});
async function expectNotificationListRequest(
  httpMock: HttpTestingController,
  scope: 'workspace' | 'personal-workspace' = 'workspace'
) {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const request = httpMock.expectOne((req) => req.method === 'GET' && req.url.includes('/items/notifications'));
  const decoded = decodeURIComponent(request.request.urlWithParams);
  expect(request.request.method).toBe('GET');
  expect(request.request.url).toContain('/items/notifications');
  expect(request.request.withCredentials).toBe(true);
  expect(decoded).toContain('limit=30');
  expect(decoded).toContain('sort=-date_created');
  if (scope === 'personal-workspace') {
    expect(decoded).toContain('filter[_or][0][business_profile][_eq]=profile-1');
    expect(decoded).toContain('filter[_or][1][business_profile][_null]=true');
    expect(decoded).toContain('filter[_or][1][recipient][_eq]=user-1');
  } else {
    expect(decoded).toContain('filter[business_profile][_eq]=profile-1');
  }
  expect(request.request.withCredentials).toBe(true);
  return request;
}

async function waitForLoadedState(service: NotificationsService, expectedCount = 1): Promise<void> {
  await vi.waitFor(() => {
    const state = (service as any).stateSubject.value;
    expect(state.loading).toBe(false);
    expect(state.recentNotifications).toHaveLength(expectedCount);
  });
}

describe('NotificationsService', () => {
  const originalPathname = window.location.pathname;

  afterEach(() => {
    window.history.replaceState({}, '', originalPathname || '/');
  });

  it('does not start notification reads while workspace activation route is active', () => {
    window.history.replaceState({}, '', '/app/workspace-activating');

    const state$ = new BehaviorSubject<CompanyContextState>({
      loading: false,
      error: null,
      context: readyContext()
    });
    const http = {
      get: vi.fn(() => of({ data: [] }))
    };
    const service = new NotificationsService(
      http as any,
      {
        state$: state$.asObservable(),
        snapshot: () => state$.value
      } as any
    );

    service.initialize();

    expect(http.get).not.toHaveBeenCalled();
  });
});
describe('NotificationsService notification filters', () => {
  let service: NotificationsService;
  let httpMock: HttpTestingController;
  let state$: BehaviorSubject<CompanyContextState>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    state$ = new BehaviorSubject<CompanyContextState>({
      loading: false,
      error: null,
      context: readyContext()
    });

    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        NotificationsService,
        {
          provide: CompanyContextService,
          useValue: {
            state$: state$.asObservable(),
            snapshot: () => state$.value
          }
        }
      ]
    }).compileComponents();

    service = TestBed.inject(NotificationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('includes personal notifications alongside workspace notifications when a user scope field exists', async () => {
    service.initialize();
    state$.next({
      loading: false,
      error: null,
      context: readyContext()
    });

    const fieldsRequest = httpMock.expectOne((req) => req.url.includes('/fields/notifications'));
    fieldsRequest.flush({
      data: [
        { field: 'id' },
        { field: 'status' },
        { field: 'title' },
        { field: 'message' },
        { field: 'business_profile' },
        { field: 'date_created' },
        { field: 'user_created' },
        { field: 'recipient' },
        { field: 'read_at' },
        { field: 'type' },
        { field: 'link_type' },
        { field: 'link_id' }
      ]
    });

    const notificationsRequest = await expectNotificationListRequest(httpMock, 'personal-workspace');
    notificationsRequest.flush({ data: [] });
  });

  it('marks an unread notification read and decrements the count once', async () => {
    service.initialize();

    const fieldsRequest = httpMock.expectOne((req) => req.url.includes('/fields/notifications'));
    fieldsRequest.flush({
      data: [
        { field: 'id' },
        { field: 'status' },
        { field: 'title' },
        { field: 'message' },
        { field: 'business_profile' },
        { field: 'date_created' },
        { field: 'user_created' },
        { field: 'read_at' },
        { field: 'type' },
        { field: 'link_type' },
        { field: 'link_id' }
      ]
    });

    const notificationsRequest = await expectNotificationListRequest(httpMock);
    notificationsRequest.flush({
      data: [
        {
          id: 'notification-1',
          status: 'unread',
          title: 'Read me',
          message: 'Open me',
          business_profile: 'profile-1',
          date_created: '2026-07-01T12:00:00.000Z',
          read_at: null,
          type: 'info',
          link_type: 'info',
          link_id: 'notification-1'
        }
      ]
    });

    await waitForLoadedState(service);
    const markPromise = service.markNotificationRead('notification-1');
    const optimisticState = (service as any).stateSubject.value;

    expect(optimisticState.unreadCount).toBe(0);
    expect(optimisticState.recentNotifications[0]).toEqual(expect.objectContaining({
      id: 'notification-1',
      status: 'read',
      isUnread: false
    }));

    await Promise.resolve();
    const patchRequest = httpMock.expectOne((req) =>
      req.method === 'PATCH' && req.url.includes('/items/notifications/notification-1')
    );
    expect(patchRequest.request.body).toEqual(expect.objectContaining({
      status: 'read'
    }));
    expect(typeof patchRequest.request.body.read_at).toBe('string');
    patchRequest.flush({ data: { id: 'notification-1' } });

    await expect(markPromise).resolves.toBeUndefined();
    expect((service as any).stateSubject.value.unreadCount).toBe(0);
  });

  it('does nothing for an already-read notification', async () => {
    service.initialize();

    const fieldsRequest = httpMock.expectOne((req) => req.url.includes('/fields/notifications'));
    fieldsRequest.flush({
      data: [
        { field: 'id' },
        { field: 'status' },
        { field: 'title' },
        { field: 'message' },
        { field: 'business_profile' },
        { field: 'date_created' },
        { field: 'user_created' },
        { field: 'read_at' }
      ]
    });

    const notificationsRequest = await expectNotificationListRequest(httpMock);
    notificationsRequest.flush({
      data: [
        {
          id: 'notification-1',
          status: 'read',
          title: 'Read me',
          message: 'Already read',
          business_profile: 'profile-1',
          date_created: '2026-07-01T12:00:00.000Z',
          read_at: '2026-07-01T12:05:00.000Z'
        }
      ]
    });

    await waitForLoadedState(service);
    await expect(service.markNotificationRead('notification-1')).resolves.toBeUndefined();
    httpMock.expectNone((req) => req.method === 'PATCH' && req.url.includes('/items/notifications/notification-1'));
    expect((service as any).stateSubject.value.unreadCount).toBe(0);
  });

  it('restores the unread state when read persistence fails', async () => {
    service.initialize();

    const fieldsRequest = httpMock.expectOne((req) => req.url.includes('/fields/notifications'));
    fieldsRequest.flush({
      data: [
        { field: 'id' },
        { field: 'status' },
        { field: 'title' },
        { field: 'message' },
        { field: 'business_profile' },
        { field: 'date_created' },
        { field: 'user_created' },
        { field: 'read_at' }
      ]
    });

    const notificationsRequest = await expectNotificationListRequest(httpMock);
    notificationsRequest.flush({
      data: [
        {
          id: 'notification-1',
          status: 'unread',
          title: 'Read me',
          message: 'Open me',
          business_profile: 'profile-1',
          date_created: '2026-07-01T12:00:00.000Z',
          read_at: null
        }
      ]
    });

    await waitForLoadedState(service);
    const markPromise = service.markNotificationRead('notification-1');
    expect((service as any).stateSubject.value.unreadCount).toBe(0);

    await waitForLoadedState(service);
    const patchRequest = httpMock.expectOne((req) =>
      req.method === 'PATCH' && req.url.includes('/items/notifications/notification-1')
    );
    patchRequest.flush({ errors: [{ message: 'Forbidden' }] }, { status: 403, statusText: 'Forbidden' });

    await expect(markPromise).rejects.toBeTruthy();
    expect((service as any).stateSubject.value.unreadCount).toBe(1);
    expect((service as any).stateSubject.value.recentNotifications[0]).toEqual(expect.objectContaining({
      id: 'notification-1',
      status: 'unread',
      isUnread: true
    }));
  });

  it('deduplicates in-flight read persistence for one notification', async () => {
    service.initialize();

    const fieldsRequest = httpMock.expectOne((req) => req.url.includes('/fields/notifications'));
    fieldsRequest.flush({
      data: [
        { field: 'id' },
        { field: 'status' },
        { field: 'title' },
        { field: 'message' },
        { field: 'business_profile' },
        { field: 'date_created' },
        { field: 'user_created' },
        { field: 'read_at' }
      ]
    });

    const notificationsRequest = await expectNotificationListRequest(httpMock);
    notificationsRequest.flush({
      data: [
        {
          id: 'notification-1',
          status: 'unread',
          title: 'Read me',
          message: 'Open me',
          business_profile: 'profile-1',
          date_created: '2026-07-01T12:00:00.000Z',
          read_at: null
        }
      ]
    });

    await waitForLoadedState(service);
    const first = service.markNotificationRead('notification-1');
    const second = service.markNotificationRead('notification-1');

    await Promise.resolve();
    const patchRequests = httpMock.match((req) =>
      req.method === 'PATCH' && req.url.includes('/items/notifications/notification-1')
    );
    expect(patchRequests).toHaveLength(1);
    const patchRequest = patchRequests[0];
    patchRequest.flush({ data: { id: 'notification-1' } });

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    httpMock.expectNone((req) =>
      req.method === 'PATCH' && req.url.includes('/items/notifications/notification-1')
    );
  });
});
