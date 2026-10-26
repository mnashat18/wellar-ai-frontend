import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';

import { DashboardMobileComponent } from './dashboard-mobile.component';
import { DashboardService, type DashboardSnapshot, type ScanResultsAccessInfo } from '../../services/dashboard.service';
import { SubscriptionService } from '../../services/subscription.service';

describe('DashboardMobileComponent scan-result error state', () => {
  let fixture: ComponentFixture<DashboardMobileComponent>;
  let access: BehaviorSubject<ScanResultsAccessInfo>;
  let snapshot: Subject<DashboardSnapshot>;

  beforeEach(async () => {
    localStorage.removeItem('dashboard_snapshot_v1');
    localStorage.removeItem('dashboard_snapshot_ts');
    access = new BehaviorSubject<ScanResultsAccessInfo>({ state: 'available', message: null, missingFields: [] });
    snapshot = new Subject<DashboardSnapshot>();

    await TestBed.configureTestingModule({
      imports: [DashboardMobileComponent],
      providers: [
        provideRouter([]),
        {
          provide: DashboardService,
          useValue: {
            getScanResultsAccessInfo: () => access.asObservable(),
            getDashboardSnapshot: () => snapshot.asObservable()
          }
        },
        { provide: SubscriptionService, useValue: { getBusinessAccessSnapshot: () => new BehaviorSubject({ hasBusinessAccess: true }) } }
      ]
    }).overrideComponent(DashboardMobileComponent, {
      set: { imports: [CommonModule, RouterModule], schemas: [CUSTOM_ELEMENTS_SCHEMA] }
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardMobileComponent);
  });

  afterEach(() => {
    localStorage.removeItem('dashboard_snapshot_v1');
    localStorage.removeItem('dashboard_snapshot_ts');
  });

  it('ends the loading display and hides zero metrics when scan results are forbidden', async () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading data...');

    const permissionDenied: ScanResultsAccessInfo = {
      state: 'permission_blocked',
      message: 'You are signed in, but your account does not have permission to view scan results.',
      missingFields: []
    };
    access.next(permissionDenied);
    snapshot.next({
      scans: [],
      stats: { stable: 0, low_focus: 0, fatigue: 0, high_risk: 0 },
      latest: null,
      resultsAccess: permissionDenied
    });
    snapshot.complete();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('does not have permission to view scan results');
    expect(fixture.nativeElement.textContent).not.toContain('Loading data...');
    expect(fixture.nativeElement.textContent).not.toContain('Total Scans');
    expect(fixture.nativeElement.textContent).not.toContain('No scans yet.');
  });
});
