import { of, Subject, throwError } from 'rxjs';

import { CompanySetupPageComponent } from './company-setup';

describe('CompanySetupPageComponent', () => {
  let component: CompanySetupPageComponent;
  let createApplication: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createApplication = vi.fn();
    navigateByUrl = vi.fn(() => Promise.resolve(true));

    component = new CompanySetupPageComponent(
      { ensureSessionToken: vi.fn(), getVerifiedCurrentUser: vi.fn() } as never,
      { createApplication } as never,
      { navigateByUrl } as never
    );
    component.currentUserId = 'user-1';
    component.form.companyName = 'Northwind Logistics';
    component.form.contactName = 'Jane Owner';
    component.form.workEmail = 'jane@example.com';
  });

  it('preserves local validation and does not submit incomplete data', () => {
    component.form.companyName = '';

    component.submit();

    expect(createApplication).not.toHaveBeenCalled();
    expect(component.submitting).toBe(false);
    expect(component.statusMessage).toBe('Please complete the required fields.');
  });

  it('shows a safe authorization message for rejected requests', () => {
    createApplication.mockReturnValue(throwError(() => ({
      status: 403,
      error: { message: 'DirectusException SQL permission failure' }
    })));

    component.submit();

    expect(component.submitting).toBe(false);
    expect(component.statusMessage).toBe('You don’t have permission to perform this action.');
    expect(component.statusMessage).not.toContain('DirectusException');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows safe network, timeout, and server messages', () => {
    const failures = [
      [{ status: 0, error: { message: 'Directus network failure' } }, 'We couldn’t reach the server. Check your connection and try again.'],
      [{ name: 'TimeoutError', message: 'backend timeout SQLSTATE' }, 'The request took too long. Please try again.'],
      [{ status: 500, error: { message: 'SQLSTATE internal failure' } }, 'Something went wrong on our end. Please try again later.']
    ] as const;

    for (const [failure, expected] of failures) {
      createApplication.mockReturnValue(throwError(() => failure));
      component.submit();

      expect(component.submitting).toBe(false);
      expect(component.statusMessage).toBe(expected);
      expect(component.statusMessage).not.toContain('SQL');
    }
  });

  it('prevents duplicate submissions while the request is pending', () => {
    const pending = new Subject<unknown>();
    createApplication.mockReturnValue(pending.asObservable());

    component.submit();
    component.submit();

    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(component.submitting).toBe(true);

    pending.next({ id: 'application-1' });
    pending.complete();

    expect(component.submitting).toBe(false);
    expect(navigateByUrl).toHaveBeenCalledWith('/app/workspace-access');
  });

  it('does not navigate when the response cannot confirm creation', () => {
    createApplication.mockReturnValue(of({ id: '' }));

    component.submit();

    expect(component.submitting).toBe(false);
    expect(component.statusMessage).toBe('We could not confirm the workspace request. Please try again.');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('navigates only after a confirmed application response', () => {
    createApplication.mockReturnValue(of({ id: 'application-1' }));

    component.submit();

    expect(component.submitting).toBe(false);
    expect(component.statusMessage).toBe('Workspace request submitted. Redirecting...');
    expect(navigateByUrl).toHaveBeenCalledWith('/app/workspace-access');
  });
});
