import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { RequestsMobileComponent } from './requests-mobile.component';
import { AuthService } from '../../services/auth';
import { BusinessCenterService } from '../../services/business-center.service';

describe('RequestsMobileComponent session authentication', () => {
  let fixture: ComponentFixture<RequestsMobileComponent>;
  let component: RequestsMobileComponent;
  let auth: { getVerifiedCurrentUser: ReturnType<typeof vi.fn>; isSessionEstablished: ReturnType<typeof vi.fn> };
  let business: any;

  beforeEach(async () => {
    auth = {
      getVerifiedCurrentUser: vi.fn().mockReturnValue(of({ id: 'user-42', email: 'me@example.com' })),
      isSessionEstablished: vi.fn().mockReturnValue(true)
    };
    business = {
      dailyRequestLimit: 10,
      getHubAccessState: vi.fn().mockReturnValue(of({ hasPaidAccess: false, userId: 'user-42', permissions: {} })),
      countTodayRequests: vi.fn().mockReturnValue(0),
      createScanRequest: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [RequestsMobileComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: BusinessCenterService, useValue: business }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestsMobileComponent);
    component = fixture.componentInstance;
  });

  it('resolves identity from the verified current-user API', () => {
    fixture.detectChanges();
    expect(auth.getVerifiedCurrentUser).toHaveBeenCalled();
    expect((component as any).currentAccessUserId).toBe('user-42');
  });

  it('fails closed when no verified session user is available', () => {
    auth.getVerifiedCurrentUser.mockReturnValue(of(null));
    fixture.detectChanges();
    expect((component as any).currentAccessUserId).toBeNull();
    expect((component as any).loadingPlanAccess).toBe(true);
  });

  it('uses the verified user id for ownership filtering', () => {
    fixture.detectChanges();
    const fetchRequests = (component as any).fetchRequests.bind(component);
    const request = fetchRequests({ requestedForUserId: (component as any).currentAccessUserId });
    expect(request).toBeTruthy();
    expect((component as any).currentAccessUserId).toBe('user-42');
  });

  it('uses business access state for workspace filtering', () => {
    fixture.detectChanges();
    expect(business.getHubAccessState).toHaveBeenCalled();
    expect((component as any).currentAccessUserId).toBe('user-42');
  });

  it('contains no token/JWT authentication helpers or bearer construction', () => {
    const source = RequestsMobileComponent.toString();
    expect(source).not.toContain('Bearer');
    expect(source).not.toContain('decodeJwt');
    expect(source).not.toContain('getUserToken');
    expect(source).not.toContain('getStoredAccessToken');
  });
});
