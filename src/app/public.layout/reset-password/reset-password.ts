import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, defer, finalize, of, timeout } from 'rxjs';

import { AuthService } from '../../services/auth';
import { mapSafeError } from '../../shared/errors/safe-error.mapper';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css'
})
export class ResetPasswordComponent implements OnDestroy {
  private readonly authTimeoutMs = 20000;
  private readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private readonly passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
  private readonly resendCooldownSeconds = 240;

  private resendEmail = '';
  private resendTimerId: number | null = null;

  @ViewChild('successHeading') private successHeading?: ElementRef<HTMLHeadingElement>;

  readonly requestSuccessHeading = 'Check your inbox';
  readonly invalidTokenMessage = 'This reset link is invalid or has expired. Request a new link.';

  email = '';
  password = '';
  confirmPassword = '';
  maskedEmail = '';
  feedback = '';
  requestView: 'form' | 'success' = 'form';
  resetView: 'form' | 'success' = 'form';
  requestError = '';
  submitting = false;
  resendCountdown = 0;
  showPassword = false;
  showConfirmPassword = false;

  emailTouched = false;
  passwordTouched = false;
  confirmPasswordTouched = false;
  submitAttempted = false;

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  get token(): string | null {
    const value = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
    return value || null;
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  get emailError(): string | null {
    const normalized = this.email.trim();
    if (!normalized) {
      return 'Email address is required.';
    }

    return this.emailPattern.test(normalized) ? null : 'Enter a valid email address.';
  }

  get passwordError(): string | null {
    if (!this.password) {
      return 'Password is required.';
    }

    return this.passwordPattern.test(this.password)
      ? null
      : 'Password must be 10 to 128 characters and include at least one letter and one number.';
  }

  get confirmPasswordError(): string | null {
    if (!this.confirmPassword) {
      return 'Confirm your password.';
    }

    return this.password === this.confirmPassword ? null : 'Passwords do not match.';
  }

  get requestFormValid(): boolean {
    return this.emailError === null;
  }

  get resetFormValid(): boolean {
    return Boolean(this.token) && this.passwordError === null && this.confirmPasswordError === null;
  }

  get showEmailError(): boolean {
    return (this.emailTouched || this.submitAttempted) && this.emailError !== null;
  }

  get showPasswordError(): boolean {
    return (this.passwordTouched || this.submitAttempted) && this.passwordError !== null;
  }

  get showConfirmPasswordError(): boolean {
    return (this.confirmPasswordTouched || this.submitAttempted) && this.confirmPasswordError !== null;
  }

  get canResend(): boolean {
    return this.resendCountdown === 0 && !this.submitting;
  }

  get resendLabel(): string {
    if (this.resendCountdown === 0) {
      return 'Resend email';
    }

    return `Resend in ${this.formatCountdown(this.resendCountdown)}`;
  }

  submitRequest(): void {
    this.sendResetRequest(this.email.trim(), true);
  }

  resendRequest(): void {
    if (!this.canResend || !this.resendEmail) {
      return;
    }

    this.sendResetRequest(this.resendEmail, false);
  }

  useDifferentEmail(): void {
    this.clearResendTimer();
    this.resendEmail = '';
    this.maskedEmail = '';
    this.email = '';
    this.requestError = '';
    this.requestView = 'form';
    this.resendCountdown = 0;
    this.submitAttempted = false;
    this.emailTouched = false;
    this.submitting = false;
  }

  submitReset(): void {
    this.submitAttempted = true;
    this.passwordTouched = true;
    this.confirmPasswordTouched = true;
    this.feedback = '';

    if (!this.resetFormValid) {
      this.focusFirstInvalidResetField();
      return;
    }

    const token = this.token;
    if (!token) {
      this.feedback = this.invalidTokenMessage;
      return;
    }

    this.submitting = true;

    defer(() => this.auth.resetPassword(token, this.password)).pipe(
      timeout(this.authTimeoutMs),
      finalize(() => {
        this.submitting = false;
        this.cdr.markForCheck();
      }),
      catchError((error) => {
        const mapped = mapSafeError(error);
        this.feedback = this.isInvalidResetTokenFailure(mapped.kind)
          ? this.invalidTokenMessage
          : mapped.userMessage;
        this.cdr.markForCheck();
        return of('__reset_failed__');
      })
    ).subscribe(async (result) => {
      if (result === '__reset_failed__') {
        return;
      }

      this.password = '';
      this.confirmPassword = '';
      this.submitAttempted = false;
      this.passwordTouched = false;
      this.confirmPasswordTouched = false;
      this.showPassword = false;
      this.showConfirmPassword = false;
      this.resetView = 'success';
      this.auth.setAuthNotice('Password updated. Sign in with your new password.');
      this.cdr.markForCheck();
    });
  }

  async goToSignIn(): Promise<void> {
    await this.router.navigate(['/'], {
      queryParams: { auth: 'login' },
      replaceUrl: true
    });
  }

  async startOver(): Promise<void> {
    this.password = '';
    this.confirmPassword = '';
    this.feedback = '';
    this.submitAttempted = false;
    this.passwordTouched = false;
    this.confirmPasswordTouched = false;
    this.showPassword = false;
    this.showConfirmPassword = false;
    this.resetView = 'form';
    await this.router.navigate(['/reset-password'], { replaceUrl: true });
  }

  private sendResetRequest(email: string, resetFormState: boolean): void {
    const normalizedEmail = email.trim();

    if (resetFormState) {
      this.submitAttempted = true;
      this.emailTouched = true;
    }

    this.requestError = '';

    if (!normalizedEmail || !this.emailPattern.test(normalizedEmail)) {
      this.focusFirstInvalidRequestField();
      return;
    }

    this.submitting = true;

    defer(() => this.auth.requestPasswordReset(normalizedEmail)).pipe(
      timeout(this.authTimeoutMs),
      finalize(() => {
        this.submitting = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => this.applyRequestSuccess(normalizedEmail),
      error: (error) => {
        if (this.isEnumerationSafeRequestError(error)) {
          this.applyRequestSuccess(normalizedEmail);
        } else {
          this.applyRequestFailure(mapSafeError(error).userMessage);
        }
      }
    });
  }

  private applyRequestSuccess(email: string): void {
    this.submitting = false;
    this.resendEmail = email;
    this.maskedEmail = this.maskEmail(email);
    this.email = '';
    this.requestError = '';
    this.emailTouched = false;
    this.submitAttempted = false;
    this.requestView = 'success';
    this.startResendCooldown();
    this.focusSuccessHeading();
    this.cdr.markForCheck();
  }

  private applyRequestFailure(message = 'Unable to send a reset link right now. Please try again.'): void {
    this.submitting = false;
    this.requestView = 'form';
    this.requestError = message;
    this.cdr.markForCheck();
  }

  private isInvalidResetTokenFailure(kind: string): boolean {
    return kind === 'authentication' || kind === 'validation' || kind === 'not_found';
  }

  private maskEmail(value: string): string {
    const normalized = value.trim();
    const atIndex = normalized.indexOf('@');

    if (atIndex <= 0) {
      return '••••••';
    }

    const localPart = normalized.slice(0, atIndex);
    const domain = normalized.slice(atIndex);
    return `${localPart.slice(0, 4)}••••••${domain}`;
  }

  private isEnumerationSafeRequestError(error: any): boolean {
    const mapped = mapSafeError(error);
    const status = mapped.status ?? 0;
    const message = (
      error?.error?.errors?.[0]?.extensions?.reason ||
      error?.error?.errors?.[0]?.message ||
      error?.error?.message ||
      error?.message ||
      ''
    ).toString().toLowerCase();

    if (status === 404) {
      return true;
    }

    return (status === 400 || status === 403) && (
      message.includes('not found') ||
      message.includes('no user') ||
      message.includes('no account') ||
      message.includes('user') && message.includes('found')
    );
  }

  private focusFirstInvalidRequestField(): void {
    if (typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      const input = document.querySelector('input[name="resetEmail"]') as HTMLInputElement | null;
      input?.focus();
    }, 0);
  }

  private focusFirstInvalidResetField(): void {
    if (typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      if (this.passwordError !== null) {
        (document.querySelector('input[name="newPassword"]') as HTMLInputElement | null)?.focus();
        return;
      }

      if (this.confirmPasswordError !== null) {
        (document.querySelector('input[name="confirmPassword"]') as HTMLInputElement | null)?.focus();
      }
    }, 0);
  }

  private startResendCooldown(): void {
    this.clearResendTimer();
    this.resendCountdown = this.resendCooldownSeconds;

    if (typeof window === 'undefined') {
      return;
    }

    this.resendTimerId = window.setInterval(() => {
      if (this.resendCountdown <= 1) {
        this.resendCountdown = 0;
        this.clearResendTimer();
        this.cdr.markForCheck();
        return;
      }

      this.resendCountdown -= 1;
      this.cdr.markForCheck();
    }, 1000);
  }

  formatCountdown(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private clearResendTimer(): void {
    if (this.resendTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.resendTimerId);
    }

    this.resendTimerId = null;
  }

  private focusSuccessHeading(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.setTimeout(() => {
      this.successHeading?.nativeElement.focus();
    }, 0);
  }
}
