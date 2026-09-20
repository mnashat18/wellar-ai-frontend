import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, NEVER, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CompanyContextService } from '../../core/context/company-context.service';
import { AuthService } from '../../services/auth';
import { InviteService } from '../../services/invites';
import { PostAuthWelcomeService } from '../../services/post-auth-welcome.service';
import { PostLoginRoutingService } from '../../services/post-login-routing.service';
import { Authlanding } from './authlanding';

describe('Authlanding', () => {
  let component: Authlanding;
  let fixture: ComponentFixture<Authlanding>;
  let routeStub: {
    snapshot: {
      queryParamMap: ReturnType<typeof convertToParamMap>;
      routeConfig: { path: string };
      data: Record<string, unknown>;
    };
    queryParamMap: any;
  };
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let authSpy: {
    consumeAuthNotice: ReturnType<typeof vi.fn>;
    checkEmailAvailability: ReturnType<typeof vi.fn>;
    signup: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    loginWithGoogle: ReturnType<typeof vi.fn>;
    setPostAuthRedirect: ReturnType<typeof vi.fn>;
  };
  let companyContextSpy: {
    snapshot: ReturnType<typeof vi.fn>;
  };
  let welcomeSpy: {
    queueReturningWelcome: ReturnType<typeof vi.fn>;
    queueWorkspaceWelcome: ReturnType<typeof vi.fn>;
  };
  let postLoginRoutingSpy: {
    resolveDestination: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject(convertToParamMap({ auth: 'signup' }));
    routeStub = {
      snapshot: {
        queryParamMap: convertToParamMap({ auth: 'signup' }),
        routeConfig: { path: '' },
        data: {}
      },
      queryParamMap: queryParams$.asObservable()
    };

    authSpy = {
      consumeAuthNotice: vi.fn(() => ''),
      checkEmailAvailability: vi.fn(() => of({ data: { available: true } })),
      signup: vi.fn(() => of({})),
      login: vi.fn(() => of({ access_token: 'token' })),
      loginWithGoogle: vi.fn(),
      setPostAuthRedirect: vi.fn()
    };
    companyContextSpy = {
      snapshot: vi.fn(() => ({
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
          activeBusinessProfileName: 'Wellar',
          activeDepartmentId: null,
          activeDepartmentName: null,
          activeMemberRole: 'owner',
          availableCompanies: [],
          hubReason: null
        }
      }))
    };
    welcomeSpy = {
      queueReturningWelcome: vi.fn(),
      queueWorkspaceWelcome: vi.fn()
    };
    postLoginRoutingSpy = {
      resolveDestination: vi.fn(() => Promise.resolve('/app/workspace-access'))
    };

    await TestBed.configureTestingModule({
      imports: [Authlanding],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: routeStub
        },
        {
          provide: AuthService,
          useValue: authSpy
        },
        {
          provide: InviteService,
          useValue: {
            getPendingInviteToken: () => null,
            setPendingInviteToken: () => undefined
          }
        },
        {
          provide: PostLoginRoutingService,
          useValue: postLoginRoutingSpy
        },
        {
          provide: CompanyContextService,
          useValue: companyContextSpy
        },
        {
          provide: PostAuthWelcomeService,
          useValue: welcomeSpy
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Authlanding);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  async function renderSignupModal(): Promise<void> {
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'signup' });
    queryParams$.next(convertToParamMap({ auth: 'signup' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function renderLoginModal(): Promise<void> {
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'login' });
    queryParams$.next(convertToParamMap({ auth: 'login' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function signupForm(): HTMLFormElement {
    return document.body.querySelector('form.auth-form') as HTMLFormElement;
  }

  function signupSubmitButton(): HTMLButtonElement {
    return document.body.querySelector('form.auth-form button[type="submit"]') as HTMLButtonElement;
  }

  function loginSubmitButton(): HTMLButtonElement {
    return document.body.querySelector('form.auth-form button[type="submit"]') as HTMLButtonElement;
  }

  function loginFeedbackText(): string {
    return (document.body.querySelector('.auth-feedback')?.textContent ?? '').trim();
  }

  async function setLoginInputValue(name: string, value: string): Promise<void> {
    const input = document.body.querySelector(`form.auth-form input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setSignupInputValue(name: string, value: string): Promise<void> {
    const input = document.body.querySelector(`form.auth-form input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the login modal when the auth query param is present', async () => {
    queryParams$.next(convertToParamMap({ auth: 'login' }));
    routeStub.snapshot.queryParamMap = convertToParamMap({ auth: 'login' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const modal = document.body.querySelector('app-viewport-dialog');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Welcome back');
  });

  it('shows a forgot password action in the login state', async () => {
    await renderLoginModal();

    const forgotLink = Array.from(document.body.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Forgot password?'
    ) as HTMLAnchorElement | undefined;

    expect(forgotLink).toBeTruthy();
    expect(forgotLink?.getAttribute('href')).toContain('/reset-password');
  });

  it('opens the signup modal when the auth query param is present', async () => {
    await renderSignupModal();

    const modal = document.body.querySelector('app-viewport-dialog');
    expect(component.showAuthModal).toBe(true);
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Start your organization');
  });

  it('renders the signup form with novalidate and keeps the submit button usable before requests', async () => {
    await renderSignupModal();

    const form = signupForm();
    const button = signupSubmitButton();
    const note = document.body.querySelector('.trial-note')?.textContent ?? '';

    expect(form.hasAttribute('novalidate')).toBe(true);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Create account');
    expect(note).toContain('Create your account, then set up your organization in the next step.');
  });

  it('blocks names containing digits or unsupported symbols', async () => {
    await renderSignupModal();

    component.signup.firstName = 'John3';
    component.signup.lastName = 'Carter!';

    expect(component.signupFieldError('firstName')).toBe('Enter a valid first name.');
    expect(component.signupFieldError('lastName')).toBe('Enter a valid last name.');
  });

  it('accepts Arabic, hyphenated, and apostrophe names after whitespace normalization', async () => {
    await renderSignupModal();

    component.signup.firstName = '  عبد   الرحمن  ';
    component.signup.lastName = "  Anne-Marie O'Connor  ";
    component.markSignupFieldTouched('firstName');
    component.markSignupFieldTouched('lastName');

    expect(component.signup.firstName).toBe('عبد الرحمن');
    expect(component.signup.lastName).toBe("Anne-Marie O'Connor");
    expect(component.signupFieldError('firstName')).toBeNull();
    expect(component.signupFieldError('lastName')).toBeNull();
  });

  it('blocks malformed email addresses and accepts corporate and Gmail-style addresses', async () => {
    await renderSignupModal();

    component.signup.email = 'owner@invalid';
    expect(component.signupFieldError('email')).toBe('Enter a valid email address.');

    component.signup.email = 'owner@company.com';
    expect(component.signupFieldError('email')).toBeNull();

    component.signup.email = 'owner@gmail.com';
    expect(component.signupFieldError('email')).toBeNull();
  });

  it('enforces the exact password rule and accepts a valid password', async () => {
    await renderSignupModal();

    component.signup.password = '123';
    expect(component.signupFieldError('password')).toBe(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );

    component.signup.password = 'abcdefghij';
    expect(component.signupFieldError('password')).toBe(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );

    component.signup.password = '1234567890';
    expect(component.signupFieldError('password')).toBe(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );

    component.signup.password = 'ValidPass123';
    expect(component.signupFieldError('password')).toBeNull();
  });

  it('shows inline errors and does not call the registration API on a real blank submit', async () => {
    await renderSignupModal();

    const form = signupForm();
    const button = signupSubmitButton();

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(authSpy.signup).not.toHaveBeenCalled();
    expect(component.submitting).toBe(false);
    expect(component.signupTouched).toEqual({
      firstName: true,
      lastName: true,
      email: true,
      password: true
    });
    expect(document.body.querySelector('#signup-first-name-error')?.textContent).toContain('First name is required.');
    expect(document.body.querySelector('#signup-last-name-error')?.textContent).toContain('Last name is required.');
    expect(document.body.querySelector('#signup-email-error')?.textContent).toContain('Email address is required.');
    expect(document.body.querySelector('#signup-password-error')?.textContent).toContain('Password is required.');
    expect(document.activeElement?.getAttribute('name')).toBe('firstName');
  });

  it('shows inline errors and does not call the registration API on a real invalid submit', async () => {
    await renderSignupModal();

    await setSignupInputValue('firstName', 'John!');
    await setSignupInputValue('lastName', '');
    await setSignupInputValue('email', 'invalid-email');
    await setSignupInputValue('password', '1234567890');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authSpy.signup).not.toHaveBeenCalled();
    expect(document.body.querySelector('#signup-first-name-error')?.textContent).toContain('Enter a valid first name.');
    expect(document.body.querySelector('#signup-last-name-error')?.textContent).toContain('Last name is required.');
    expect(document.body.querySelector('#signup-email-error')?.textContent).toContain('Enter a valid email address.');
    expect(document.body.querySelector('#signup-password-error')?.textContent).toContain(
      'Password must be 10 to 128 characters and include at least one letter and one number.'
    );
  });

  it('clears the last name inline error immediately after valid input without another blur or submit', async () => {
    await renderSignupModal();

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const lastNameInput = document.body.querySelector('input[name="lastName"]') as HTMLInputElement;
    expect(document.body.querySelector('#signup-last-name-error')?.textContent).toContain('Last name is required.');
    expect(lastNameInput.getAttribute('aria-invalid')).toBe('true');
    expect(lastNameInput.getAttribute('aria-describedby')).toBe('signup-last-name-error');

    await setSignupInputValue('lastName', 'Carter');

    expect(document.body.querySelector('#signup-last-name-error')).toBeNull();
    expect(lastNameInput.getAttribute('aria-invalid')).toBeNull();
    expect(lastNameInput.getAttribute('aria-describedby')).toBeNull();
    expect(document.body.querySelector('#signup-first-name-error')?.textContent).toContain('First name is required.');
  });

  it('submits normalized signup data from a real valid form submit', async () => {
    await renderSignupModal();

    await setSignupInputValue('firstName', '  Abdul   Rhman ');
    await setSignupInputValue('lastName', " O'Connor ");
    await setSignupInputValue('email', ' owner@gmail.com ');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(authSpy.signup).toHaveBeenCalledWith({
      email: 'owner@gmail.com',
      password: 'ValidPass123',
      first_name: 'Abdul Rhman',
      last_name: "O'Connor"
    });
  });

  it('maps duplicate-email signup failures to the exact safe copy and shows a login action', async () => {
    authSpy.signup = vi.fn(() =>
      throwError(() => ({
        status: 409,
        error: {
          errors: [
            {
              message: 'Value for field email has to be unique.',
              extensions: { code: 'RECORD_NOT_UNIQUE', field: 'email' }
            }
          ]
        }
      }))
    );

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Abdul');
    await setSignupInputValue('lastName', 'Rhman');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = document.body.textContent ?? '';
    expect(text).toContain('This email is already registered. Log in instead, or use a different email address.');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(component.duplicateSignupRecovery).toBe(true);
    expect(component.login.email).toBe('owner@gmail.com');
    expect(
      Array.from(document.body.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Log in')
    ).toBe(true);
    expect(welcomeSpy.queueReturningWelcome).not.toHaveBeenCalled();
    expect(welcomeSpy.queueWorkspaceWelcome).not.toHaveBeenCalled();

    const emailInput = document.body.querySelector('input[name="email"]') as HTMLInputElement;
    const duplicateError = document.getElementById('signup-email-duplicate-error');
    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    expect(emailInput.getAttribute('aria-describedby')).toContain('signup-email-duplicate-error');
    expect(duplicateError?.getAttribute('role')).toBe('alert');
    expect(duplicateError?.textContent).toContain('Use a different email');
  });

  it('keeps post-signup 401 recovery neutral instead of marking the email as taken', async () => {
    authSpy.login = vi.fn(() => throwError(() => ({ status: 401 })));

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.authMode).toBe('login');
    expect(component.login.email).toBe('owner@gmail.com');
    expect(loginFeedbackText()).toBe(
      "We couldn't sign you in automatically. If this email already has an account, log in with your existing password. Otherwise, check your inbox to verify your email, then log in."
    );
    expect(component.duplicateSignupRecovery).toBe(false);
    expect(component.signupEmailTaken).toBe(false);
    expect(document.getElementById('signup-email-duplicate-error')).toBeNull();
  });

  it('does not classify a generic signup validation failure as duplicate email', async () => {
    authSpy.signup = vi.fn(() =>
      throwError(() => ({ status: 400, error: { errors: [{ message: 'Invalid password format.' }] } }))
    );

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Signup data is invalid. Please check your input.');
    expect(document.body.textContent).not.toContain('This email is already registered. Sign in instead.');
    expect(component.duplicateSignupRecovery).toBe(false);
  });

  it('shows the safe signup network message and releases the form', async () => {
    authSpy.signup = vi.fn(() => throwError(() => ({ status: 0 })));

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('We couldn’t reach the server. Check your connection and try again.');
    expect(component.authBusy).toBe(false);
  });

  it('maps signup rate limiting to a clear retry message', async () => {
    authSpy.signup = vi.fn(() => throwError(() => ({ status: 429 })));

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Too many attempts, please wait a moment and try again.');
    expect(component.authBusy).toBe(false);
  });

  it('submits signup only once while the registration request is pending', async () => {
    const pendingSignup$ = new Subject<unknown>();
    authSpy.signup = vi.fn(() => pendingSignup$.asObservable());

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    signupSubmitButton().click();

    expect(authSpy.signup).toHaveBeenCalledTimes(1);
    expect(component.authBusy).toBe(true);
    pendingSignup$.complete();
  });

  it('shows only the generic login failure copy for bad credentials', async () => {
    authSpy.login = vi.fn(() =>
      throwError(() => ({
        status: 401,
        error: {
          errors: [
            {
              message: 'INVALID_PROVIDER'
            }
          ]
        }
      }))
    );

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'WrongPassword123');

    loginSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = document.body.textContent ?? '';
    expect(text).toContain('Email or password is incorrect.');
    expect(text).not.toContain('INVALID_PROVIDER');
    expect(text).not.toContain('Directus');
    expect(welcomeSpy.queueReturningWelcome).not.toHaveBeenCalled();
    expect(welcomeSpy.queueWorkspaceWelcome).not.toHaveBeenCalled();
  });

  it('clears busy state and does not route after a 401 login failure', async () => {
    const navigateByUrlSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    authSpy.login = vi.fn(() =>
      throwError(() => ({
        status: 401,
        error: {
          errors: [
            {
              message: 'Invalid user credentials.'
            }
          ]
        }
      }))
    );

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'WrongPassword123');

    loginSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authSpy.login).toHaveBeenCalledTimes(1);
    expect(loginFeedbackText()).toBe('Email or password is incorrect.');
    expect(component.submitting).toBe(false);
    expect(component.authBusy).toBe(false);
    expect(loginSubmitButton().disabled).toBe(false);
    expect(loginSubmitButton().textContent).toContain('Log in');
    expect(navigateByUrlSpy).not.toHaveBeenCalled();
  });

  it('applies the bounded timeout, clears loading state, and avoids routing when login hangs', async () => {
    vi.useFakeTimers();
    const navigateByUrlSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    authSpy.login = vi.fn(() => NEVER);

    try {
      await renderLoginModal();
      await setLoginInputValue('loginEmail', 'owner@gmail.com');
      await setLoginInputValue('loginPassword', 'WrongPassword123');

      loginSubmitButton().click();
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(20001);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(authSpy.login).toHaveBeenCalledTimes(1);
      expect(loginFeedbackText()).toBe('The request took too long. Please try again.');
      expect(component.submitting).toBe(false);
      expect(component.authBusy).toBe(false);
      expect(loginSubmitButton().disabled).toBe(false);
      expect(navigateByUrlSpy).not.toHaveBeenCalled();
      expect(welcomeSpy.queueReturningWelcome).not.toHaveBeenCalled();
      expect(welcomeSpy.queueWorkspaceWelcome).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears loading state and does not expose backend text on network failure', async () => {
    authSpy.login = vi.fn(() =>
      throwError(() => ({
        status: 0,
        error: {
          error: 'ECONNREFUSED from directus auth/login'
        }
      }))
    );

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'WrongPassword123');

    loginSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const feedback = loginFeedbackText();
    expect(feedback).toBe('We couldn’t reach the server. Check your connection and try again.');
    expect(feedback).not.toContain('ECONNREFUSED');
    expect(feedback).not.toContain('directus');
    expect(component.submitting).toBe(false);
    expect(component.authBusy).toBe(false);
    expect(welcomeSpy.queueReturningWelcome).not.toHaveBeenCalled();
    expect(welcomeSpy.queueWorkspaceWelcome).not.toHaveBeenCalled();
  });

  it('shows the duplicate-email alert again on every retry and clears it when email changes', async () => {
    authSpy.signup = vi.fn(() =>
      throwError(() => ({
        status: 400,
        error: { errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE', field: 'email' } }] }
      }))
    );

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authSpy.signup).toHaveBeenCalledTimes(1);
    expect(document.getElementById('signup-email-duplicate-error')).toBeTruthy();

    await setSignupInputValue('email', 'new-owner@gmail.com');
    expect(document.getElementById('signup-email-duplicate-error')).toBeNull();
  });

  it('disables signup for a taken email and re-enables it after editing to an available email', async () => {
    authSpy.checkEmailAvailability = vi.fn((email: string) =>
      of({ data: { available: email !== 'taken@example.com' } })
    );

    await renderSignupModal();
    await setSignupInputValue('email', 'taken@example.com');
    component.markSignupFieldTouched('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.signupEmailAvailabilityState).toBe('taken');
    expect(component.signupEmailTaken).toBe(true);
    expect(signupSubmitButton().disabled).toBe(true);
    expect(document.getElementById('signup-email-duplicate-error')).toBeTruthy();

    await setSignupInputValue('email', 'available@example.com');
    component.markSignupFieldTouched('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.signupEmailAvailabilityState).toBe('available');
    expect(component.signupEmailTaken).toBe(false);
    expect(signupSubmitButton().disabled).toBe(false);
    expect(document.getElementById('signup-email-duplicate-error')).toBeNull();
  });

  it('blocks registration when the submit-time availability check reports taken', async () => {
    authSpy.checkEmailAvailability = vi.fn(() => of({ data: { available: false } }));

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'taken@example.com');
    await setSignupInputValue('password', 'ValidPass123');
    component.submitSignup();
    await fixture.whenStable();

    expect(authSpy.signup).not.toHaveBeenCalled();
    expect(component.duplicateSignupRecovery).toBe(true);
  });

  it('ignores a stale availability response for a previous email', async () => {
    const firstResponse$ = new Subject<{ data: { available: boolean } }>();
    const secondResponse$ = new Subject<{ data: { available: boolean } }>();
    authSpy.checkEmailAvailability = vi.fn((email: string) =>
      email === 'old@example.com' ? firstResponse$.asObservable() : secondResponse$.asObservable()
    );

    await renderSignupModal();
    await setSignupInputValue('email', 'old@example.com');
    component.markSignupFieldTouched('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await setSignupInputValue('email', 'new@example.com');
    component.markSignupFieldTouched('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    secondResponse$.next({ data: { available: true } });
    firstResponse$.next({ data: { available: false } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.signupEmailAvailabilityState).toBe('available');
    expect(component.duplicateSignupRecovery).toBe(false);
  });

  it('debounces valid email availability checks', async () => {
    vi.useFakeTimers();
    authSpy.checkEmailAvailability = vi.fn(() => of({ data: { available: true } }));

    await renderSignupModal();
    component.handleSignupFieldInput('email', 'owner@example.com');
    vi.advanceTimersByTime(599);
    expect(authSpy.checkEmailAvailability).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(authSpy.checkEmailAvailability).toHaveBeenCalledTimes(1);
  });

  it('fails open for server errors but reports rate limiting without blocking retry', async () => {
    authSpy.checkEmailAvailability = vi.fn(() => throwError(() => ({ status: 500 })));
    await renderSignupModal();
    await setSignupInputValue('email', 'server-error@example.com');
    component.markSignupFieldTouched('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.signupEmailAvailabilityState).toBe('error');
    expect(signupSubmitButton().disabled).toBe(false);
    expect(document.body.textContent).toContain('Something went wrong. Please try again.');

    authSpy.checkEmailAvailability = vi.fn(() => throwError(() => ({ status: 429 })));
    await setSignupInputValue('email', 'rate-limited@example.com');
    component.markSignupFieldTouched('email');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.signupEmailAvailabilityMessage).toBe('Too many attempts, please wait a moment and try again.');
    expect(signupSubmitButton().disabled).toBe(false);
    expect(document.body.textContent).toContain('Too many attempts, please wait a moment and try again.');
  });

  it('switches to login with the email and focuses its password field from the duplicate alert', async () => {
    authSpy.signup = vi.fn(() =>
      throwError(() => ({ status: 409, error: { errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE', field: 'email' } }] } }))
    );

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    (Array.from(document.querySelectorAll('.auth-duplicate-error__action'))[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(component.authMode).toBe('login');
    expect(component.login.email).toBe('owner@gmail.com');
    expect(document.activeElement?.getAttribute('name')).toBe('loginPassword');
  });

  it('focuses and selects the email field when a different email is requested', async () => {
    authSpy.signup = vi.fn(() =>
      throwError(() => ({ status: 409, error: { errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE', field: 'email' } }] } }))
    );

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Owner');
    await setSignupInputValue('lastName', 'Example');
    await setSignupInputValue('email', 'owner@gmail.com');
    await setSignupInputValue('password', 'ValidPass123');
    signupSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    (Array.from(document.querySelectorAll('.auth-duplicate-error__action'))[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.duplicateSignupRecovery).toBe(false);
    expect(document.activeElement?.getAttribute('name')).toBe('email');
  });

  it.each([
    ['unknown email', 'No account found for this email.'],
    ['wrong password', 'The password is incorrect.']
  ])('does not reveal account existence for %s', async (_caseName, backendMessage) => {
    authSpy.login = vi.fn(() =>
      throwError(() => ({ status: 401, error: { errors: [{ message: backendMessage }] } }))
    );

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'WrongPassword123');
    loginSubmitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loginFeedbackText()).toBe('Email or password is incorrect.');
    expect(loginFeedbackText()).not.toContain(backendMessage);
  });

  it('submits login only once while the login request is pending', async () => {
    const pendingLogin$ = new Subject<unknown>();
    authSpy.login = vi.fn(() => pendingLogin$.asObservable());

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'ValidPass123');

    loginSubmitButton().click();
    fixture.detectChanges();
    loginSubmitButton().click();

    expect(authSpy.login).toHaveBeenCalledTimes(1);
    expect(loginSubmitButton().disabled).toBe(true);
    pendingLogin$.error({ status: 401 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.submitting).toBe(false);
    expect(loginFeedbackText()).toBe('Email or password is incorrect.');
  });

  it('keeps the login modal visible and disabled while workspace readiness is confirmed', async () => {
    let resolveDestination!: (value: string) => void;
    postLoginRoutingSpy.resolveDestination = vi.fn(
      () => new Promise<string>((resolve) => {
        resolveDestination = resolve;
      })
    );

    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'ValidPass123');

    loginSubmitButton().click();
    fixture.detectChanges();

    expect(component.showAuthModal).toBe(true);
    expect(component.authBusy).toBe(true);
    expect(loginSubmitButton().disabled).toBe(true);
    expect(loginFeedbackText()).toBe('Preparing your workspace...');

    resolveDestination('/app/dashboard');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(component.showAuthModal).toBe(false);
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/app/welcome', { replaceUrl: true });
  });

  it('queues a returning-user welcome exactly once after a successful login reaches the dashboard', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    postLoginRoutingSpy.resolveDestination = vi.fn(() => Promise.resolve('/app/dashboard'));

    await renderLoginModal();
    await setLoginInputValue('loginEmail', 'owner@gmail.com');
    await setLoginInputValue('loginPassword', 'ValidPass123');

    loginSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(welcomeSpy.queueReturningWelcome).toHaveBeenCalledTimes(1);
    expect(welcomeSpy.queueReturningWelcome).toHaveBeenCalledWith('Avery', '/app/dashboard');
    expect(welcomeSpy.queueWorkspaceWelcome).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/app/welcome', { replaceUrl: true });
  });

  it('queues a workspace welcome exactly once after a successful signup reaches the dashboard', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    postLoginRoutingSpy.resolveDestination = vi.fn(() => Promise.resolve('/app/dashboard'));

    await renderSignupModal();
    await setSignupInputValue('firstName', 'Avery');
    await setSignupInputValue('lastName', 'Owner');
    await setSignupInputValue('email', 'owner@example.com');
    await setSignupInputValue('password', 'ValidPass123');

    signupSubmitButton().click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(welcomeSpy.queueWorkspaceWelcome).toHaveBeenCalledTimes(1);
    expect(welcomeSpy.queueWorkspaceWelcome).toHaveBeenCalledWith('Avery', '/app/dashboard');
    expect(welcomeSpy.queueReturningWelcome).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/app/welcome', { replaceUrl: true });
  });
});
