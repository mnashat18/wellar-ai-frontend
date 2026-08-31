import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth';
import { SubscriptionService } from '../../services/subscription.service';
import { NotificationsComponent } from '../../components/notifications/notifications';

@Component({
  selector: 'app-profile-mobile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NotificationsComponent],
  templateUrl: './profile-mobile.html'
})
export class ProfileMobileComponent implements OnInit {
  loading = true;
  errorMessage = '';
  profile: ProfileView | null = null;
  hasBusinessAccess = false;
  editing = false;
  saving = false;
  saveFeedback: { type: 'success' | 'error' | 'info'; message: string } | null = null;
  userId: string | null = null;
  form: ProfileForm = {
    firstName: '',
    lastName: '',
    password: ''
  };
  avatarFile: File | null = null;
  avatarPreviewUrl: string | null = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
    private subscriptions: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadPlanState();
    this.loadProfile();
  }

  logout() {
    this.finishLogout();
  }

  startEdit() {
    if (!this.profile) {
      return;
    }

    this.form = {
      firstName: this.profile.firstName,
      lastName: this.profile.lastName,
      password: ''
    };
    this.avatarFile = null;
    this.clearAvatarPreview();
    this.saveFeedback = null;
    this.editing = true;
    this.cdr.detectChanges();
  }

  cancelEdit() {
    this.editing = false;
    this.avatarFile = null;
    this.clearAvatarPreview();
    this.saveFeedback = null;
    this.cdr.detectChanges();
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.avatarFile = file;
    this.updateAvatarPreview(file);
    this.cdr.detectChanges();
  }

  saveProfile() {
    if (!this.profile) {
      return;
    }

    if (!this.auth.isSessionEstablished()) {
      this.saveFeedback = { type: 'error', message: 'Session expired. Please login again.' };
      this.cdr.detectChanges();
      return;
    }

    this.saving = true;
    this.saveFeedback = { type: 'info', message: 'Saving changes...' };
    this.cdr.detectChanges();

    const nextFirstName = this.form.firstName.trim() || this.profile.firstName;
    const nextLastName = this.form.lastName.trim() || this.profile.lastName;

    this.uploadAvatar().pipe(
      switchMap((uploadResult) => {
        const avatarId = uploadResult.id;
        const payload: ProfileUpdatePayload = {
          first_name: nextFirstName,
          last_name: nextLastName
        };

        if (this.form.password.trim()) {
          payload.password = this.form.password.trim();
        }

        if (avatarId) {
          payload.avatar = avatarId;
        }
        return this.updateProfile(payload, avatarId);
      })
    ).subscribe({
      next: ({ res, avatarId }) => {
        const user = res?.data;
        if (user) {
          this.profile = this.mapProfile(user);
          if (avatarId) {
            this.profile.avatarUrl = this.buildAvatarUrl(avatarId);
          }
        }
        this.saving = false;
        this.editing = false;
        this.saveFeedback = { type: 'success', message: 'Profile updated.' };
        this.clearAvatarPreview();
        this.loadProfile();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const apiMessage =
          err?.error?.errors?.[0]?.message ||
          err?.error?.errors?.[0]?.extensions?.reason ||
          err?.message;
        this.saving = false;
        this.saveFeedback = {
          type: 'error',
          message: apiMessage ? `Failed to update profile: ${apiMessage}` : 'Failed to update profile.'
        };
        this.cdr.detectChanges();
      }
    });
  }

  private loadProfile() {
    if (!this.auth.isSessionEstablished()) {
      this.loading = false;
      this.errorMessage = 'You are not signed in.';
      this.cdr.detectChanges();
      return;
    }

    this.userId = null;
    const fields = this.getProfileFields();

    this.http.get<{ data?: ProfileUser }>(
      `${environment.API_URL}/users/me?fields=${fields}`,
      { withCredentials: true }
    ).pipe(
      map((res) => res?.data ?? null),
      switchMap((user) => {
        if (!user) {
          return of({ user: null, roleLabel: '' });
        }
        return this.resolveRoleLabel(user.role).pipe(
          map((roleLabel) => ({ user, roleLabel }))
        );
      })
    ).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: ({ user, roleLabel }) => {
        if (!user) {
          this.errorMessage = 'Profile data unavailable.';
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }

        this.profile = this.mapProfile(user, roleLabel);
        this.editing = false;
        this.saveFeedback = null;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Failed to load profile.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private updateProfile(payload: ProfileUpdatePayload, avatarId: string | null) {

    return this.http.patch<{ data?: ProfileUser }>(
      `${environment.API_URL}/users/me`,
      payload,
      { withCredentials: true }
    ).pipe(map((res) => ({ res, avatarId })));
  }

  private getProfileFields(): string {
    return [
      'id',
      'email',
      'first_name',
      'last_name',
      'title',
      'role',
      'avatar',
      'status'
    ].join(',');
  }

  private mapProfile(user: ProfileUser, roleLabelOverride?: string): ProfileView {
    const fullName = this.buildName(user.first_name, user.last_name);
    const email = user.email ?? '';
    const displayName = fullName || email || 'Wellar User';
    const initials = this.buildInitials(displayName);
    const avatarUrl = user.avatar ? this.buildAvatarUrl(user.avatar) : '';
    const status = this.formatStatus(user.status);
    const roleLabel = this.normalizeRoleLabel(
      roleLabelOverride ?? this.extractRoleName(user.role)
    );
    const memberSince = this.formatDate(
      user.date_created ?? new Date()
    );
    const lastAccess = this.formatDateTime(
      user.last_access ?? new Date()
    );

    return {
      id: user.id ?? '',
      name: displayName,
      initials,
      email,
      title: user.title ?? 'Member',
      roleLabel,
      status,
      memberSince,
      lastAccess,
      avatarUrl,
      firstName: (user.first_name ?? '').trim(),
      lastName: (user.last_name ?? '').trim()
    };
  }

  private buildName(first?: string, last?: string): string {
    const safeFirst = (first ?? '').trim();
    const safeLast = (last ?? '').trim();
    return [safeFirst, safeLast].filter(Boolean).join(' ');
  }

  private buildAvatarUrl(avatarId: string): string {
    const base = `${environment.API_URL}/assets/${avatarId}`;
    return base;
  }

  private buildInitials(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'W';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  private formatStatus(value?: string): string {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'active') return 'Active';
    if (normalized === 'suspended') return 'Suspended';
    if (normalized === 'invited') return 'Invited';
    return value ? value : 'Active';
  }

  private resolveRoleLabel(role: ProfileUser['role']) {
    const name = this.extractRoleName(role);
    if (name) return of(this.normalizeRoleLabel(name));

    if (typeof role !== 'string' || !role) {
      return of(this.normalizeRoleLabel(''));
    }

    return this.fetchRoleName(role).pipe(
      map((roleName) => this.normalizeRoleLabel(roleName)),
      catchError(() => of(this.normalizeRoleLabel('')))
    );
  }

  private fetchRoleName(roleId: string) {
    return this.http.get<{ data?: { name?: string } }>(
      `${environment.API_URL}/roles/${roleId}?fields=name`,
      { withCredentials: true }
    ).pipe(
      map((res) => res?.data?.name ?? '')
    );
  }

  private extractRoleName(role: ProfileUser['role']): string {
    if (!role) return '';
    if (typeof role === 'object') {
      const roleObj = role as { name?: string };
      return roleObj.name ?? '';
    }
    return '';
  }

  private normalizeRoleLabel(roleName: string): string {
    const name = roleName.trim();
    if (!name) {
      return '';
    }
    const lower = name.toLowerCase();
    if (lower.includes('admin')) return 'ADMIN';
    if (lower.includes('manager')) return 'MANAGER';
    if (lower.includes('user')) return 'USER';
    return name.toUpperCase();
  }

  private formatDate(value?: string | number | Date | null): string {
    if (!value) {
      return new Date().toLocaleDateString('en-CA');
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toLocaleDateString('en-CA');
    }
    return date.toLocaleDateString('en-CA');
  }

  private formatDateTime(value?: string | number | Date | null): string {
    if (!value) {
      return this.formatDateTime(new Date());
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.formatDateTime(new Date());
    }
    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  private uploadAvatar() {
    if (!this.avatarFile) {
      return of({ id: null } satisfies UploadResult);
    }

    return this.uploadAvatarWithSession().pipe(
      map((id) => ({ id } satisfies UploadResult))
    );
  }

  private uploadAvatarWithSession() {
    const formData = new FormData();
    formData.append('file', this.avatarFile as Blob);

    return this.http.post<{ data?: { id?: string } }>(
      `${environment.API_URL}/files`,
      formData,
      { withCredentials: true }
    ).pipe(
      map((res) => res?.data?.id ?? null)
    );
  }

  private updateAvatarPreview(file: File | null) {
    this.clearAvatarPreview();
    if (!file) return;
    this.avatarPreviewUrl = URL.createObjectURL(file);
  }

  private clearAvatarPreview() {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
    this.avatarPreviewUrl = null;
  }

  private finishLogout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }

  private loadPlanState() {
    this.subscriptions.getBusinessAccessSnapshot().subscribe((snapshot) => {
      this.hasBusinessAccess = snapshot.hasBusinessAccess;
      this.cdr.detectChanges();
    });
  }
}

type ProfileUser = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  role?: string | { id?: string; name?: string };
  avatar?: string;
  status?: string;
  last_access?: string;
  date_created?: string;
};

type ProfileView = {
  id: string;
  name: string;
  initials: string;
  email: string;
  title: string;
  roleLabel: string;
  status: string;
  memberSince: string;
  lastAccess: string;
  avatarUrl: string;
  firstName: string;
  lastName: string;
};

type ProfileForm = {
  firstName: string;
  lastName: string;
  password: string;
};

type ProfileUpdatePayload = {
  first_name: string;
  last_name: string;
  password?: string;
  avatar?: string;
};

type UploadResult = {
  id: string | null;
};

