import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, EMPTY, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { SelectCompanyPageComponent } from './select-company.component';

describe('SelectCompanyPageComponent workspace switching', () => {
  let fixture: ComponentFixture<SelectCompanyPageComponent>;
  let component: SelectCompanyPageComponent;
  let switchResult: Subject<unknown>;
  let switchCompany: ReturnType<typeof vi.fn>;

  const state = {
    loading: false,
    error: null,
    context: {
      availableCompanies: [
        { id: 'profile-a', membershipId: 'membership-a', name: 'A', role: 'owner', membershipStatus: 'active', isActive: true },
        { id: 'profile-b', membershipId: 'membership-b', name: 'B', role: 'owner', membershipStatus: 'active', isActive: false }
      ]
    }
  };

  beforeEach(async () => {
    switchResult = new Subject<unknown>();
    switchCompany = vi.fn(() => switchResult);

    await TestBed.configureTestingModule({
      imports: [SelectCompanyPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: CompanyContextService,
          useValue: {
            state$: new BehaviorSubject(state),
            switchCompany
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SelectCompanyPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(false);
  });

  afterEach(() => fixture.destroy());

  it('clears loading and shows a friendly message for a confirmed failure', () => {
    switchCompany.mockReturnValueOnce(throwError(() => new Error('forbidden')));

    component.switchCompany('profile-a');
    fixture.detectChanges(false);

    expect(component.switchingCompanyId).toBeNull();
    expect(component.switchErrorMessage).toBe('Could not switch organization. Please try again.');
  });

  it('clears loading without showing an error for a superseded completion', () => {
    switchCompany.mockReturnValueOnce(EMPTY);

    component.switchCompany('profile-a');

    expect(component.switchingCompanyId).toBeNull();
    expect(component.switchErrorMessage).toBe('');
  });

  it('prevents another workspace selection while switching', () => {
    component.switchCompany('profile-a');
    component.switchCompany('profile-b');
    fixture.detectChanges(false);

    expect(switchCompany).toHaveBeenCalledTimes(1);
    expect(switchCompany).toHaveBeenCalledWith('profile-a');
    expect(component.switchingCompanyId).toBe('profile-a');
  });
});
