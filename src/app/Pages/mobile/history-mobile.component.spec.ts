import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { provideRouter } from '@angular/router';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { HistoryMobileComponent } from './history-mobile.component';
import { DashboardService, type ScanResultsAccessInfo } from '../../services/dashboard.service';
import { SubscriptionService } from '../../services/subscription.service';

describe('HistoryMobileComponent scan-result access states', () => {
  let fixture: ComponentFixture<HistoryMobileComponent>;
  let access: BehaviorSubject<ScanResultsAccessInfo>;

  beforeEach(async () => {
    access = new BehaviorSubject<ScanResultsAccessInfo>({
      state: 'available',
      message: null,
      missingFields: []
    });

    await TestBed.configureTestingModule({
      imports: [HistoryMobileComponent],
      providers: [
        provideRouter([]),
        {
          provide: DashboardService,
          useValue: {
            getScanResultsAccessInfo: () => access.asObservable(),
            getScanResults: () => of([])
          }
        },
        { provide: SubscriptionService, useValue: { getBusinessAccessSnapshot: () => of({ hasBusinessAccess: false }) } }
      ]
    }).overrideComponent(HistoryMobileComponent, {
      set: { imports: [CommonModule, RouterModule], schemas: [CUSTOM_ELEMENTS_SCHEMA] }
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryMobileComponent);
  });

  it('shows a permission message instead of an empty-history message after a 403 state', () => {
    access.next({
      state: 'permission_blocked',
      message: 'Your account does not have permission to view scan results.',
      missingFields: []
    });

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('does not have permission to view scan results');
    expect(fixture.nativeElement.textContent).toContain('Scan count unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('No scans yet.');
  });

  it('continues to show an empty state when scan results loaded successfully with no rows', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Total scans: 0');
    expect(fixture.nativeElement.textContent).toContain('No scans yet.');
    expect(fixture.nativeElement.textContent).not.toContain('Scan count unavailable');
  });
});
