import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-audit-logs',
  imports: [CommonModule],
  templateUrl: './audit-logs.html',
  styleUrl: './audit-logs.css',
})

export class AuditLogs implements OnInit {
  logs: AuditLog[] = [];
  selectedLog: AuditLog | null = null;
  submitFeedback: { type: 'success' | 'error' | 'info'; message: string } | null = null;
  isAdminUser = false;
  canReviewLogs = false;
  canViewLogs = false;
  currentUserEmail = '';
  currentUserId: string | null = null;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private auth: AuthService
  ) {}

  ngOnInit() {
    this.auth.getVerifiedCurrentUser().subscribe((user) => {
      if (!user) { this.canViewLogs = false; return; }
      const role = this.roleName(user);
      const roleId = this.roleId(user);
      const allowed = (environment.AUDIT_LOG_REVIEW_ROLE_IDS ?? []).map(String);
      this.isAdminUser = /admin|owner|manager|hr/i.test(role);
      this.canReviewLogs = this.isAdminUser || allowed.includes(roleId);
      this.currentUserEmail = typeof user.email === 'string' ? user.email : '';
      this.currentUserId = typeof user.id === 'string' ? user.id : null;
      this.canViewLogs = true;
      this.loadLogs();
    });
  }

  openCreateLog(): void {
    // Placeholder hook for future create-log UX.
  }

  openLogDetails(log: {
    user: string;
    type: string;
    description: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }): void {
    // Placeholder hook for future log details UX.
    void log;
  }

  openLog(log: AuditLog): void {
    this.selectedLog = log;
    this.cdr.detectChanges();
  }

  closeLog(): void {
    this.selectedLog = null;
    this.cdr.detectChanges();
  }

  submitLog(email: string, type: string, description: string, metadataText: string) {
    const trimmedEmail = email.trim();
    const trimmedType = type.trim();
    const trimmedDescription = description.trim();
    const parsedMetadata = this.parseMetadata(metadataText.trim());
    const effectiveEmail = this.canReviewLogs ? trimmedEmail : (this.currentUserEmail || trimmedEmail);

    if (!trimmedDescription) {
      this.submitFeedback = { type: 'error', message: 'Description is required.' };
      this.cdr.detectChanges();
      return;
    }

    if (!trimmedType) {
      this.submitFeedback = { type: 'error', message: 'Type is required.' };
      this.cdr.detectChanges();
      return;
    }

    if (!effectiveEmail) {
      this.submitFeedback = { type: 'error', message: 'Email is required.' };
      this.cdr.detectChanges();
      return;
    }

    this.submitFeedback = { type: 'info', message: 'Submitting log...' };
    this.cdr.detectChanges();

    if (!this.canReviewLogs) {
      if (!this.canViewLogs) {
        this.submitFeedback = { type: 'error', message: 'Please sign in to submit logs.' };
        this.cdr.detectChanges();
        return;
      }

      this.createLog({
        user: this.currentUserId ?? undefined,
        type: trimmedType,
        description: trimmedDescription,
        metadata: parsedMetadata,
        timestamp: new Date().toISOString()
      }, null).subscribe({
        next: () => {
          console.info('[audit-logs] log created');
          this.submitFeedback = { type: 'success', message: 'Log submitted successfully.' };
          this.loadLogs();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('[audit-logs] create log error:', err);
          this.submitFeedback = { type: 'error', message: 'Failed to submit log.' };
          this.cdr.detectChanges();
        }
      });
      return;
    }

    this.resolveUserId(effectiveEmail).subscribe({
      next: (userId) => {
        this.createLog({
          user: userId ?? effectiveEmail,
          type: trimmedType,
          description: trimmedDescription,
          metadata: parsedMetadata,
          timestamp: new Date().toISOString()
        }, null).subscribe({
          next: () => {
            console.info('[audit-logs] log created');
            this.submitFeedback = { type: 'success', message: 'Log submitted successfully.' };
            this.cdr.detectChanges();
            this.loadLogs();
          },
          error: (err) => {
            console.error('[audit-logs] create log error:', err);
            this.submitFeedback = { type: 'error', message: 'Failed to submit log.' };
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        console.error('[audit-logs] resolve user error:', err);
        this.submitFeedback = { type: 'error', message: 'Failed to resolve user email.' };
        this.cdr.detectChanges();
      }
    });
  }

  private loadLogs() {
    if (!this.canReviewLogs) {
      if (!this.canViewLogs) {
        this.logs = [];
        this.cdr.detectChanges();
        return;
      }

      const filters = {
        userId: this.currentUserId,
        email: this.currentUserEmail
      };
      this.fetchLogs(filters).subscribe({
        next: (logs) => {
          console.info('[audit-logs] audit_logs count:', logs.length);
          this.applyLogs(logs);
        },
        error: (err) => {
          console.error('[audit-logs] audit_logs error:', err);
        }
      });
      return;
    }

    this.fetchLogs().subscribe({
      next: (logs) => {
        console.info('[audit-logs] audit_logs count:', logs.length);
        this.applyLogs(logs);
      },
      error: (err) => {
        console.error('[audit-logs] audit_logs error:', err);
      }
    });
  }

  private fetchLogs(
    filters?: { userId?: string | null; email?: string }
  ) {
    const fields = [
      '*',
      'user.email'
    ].join(',');

    const params = new URLSearchParams({
      'sort': '-timestamp',
      'limit': '50',
      'fields': fields
    });
    if (filters?.userId) {
      params.set('filter[user][_eq]', filters.userId);
    } else if (filters?.email) {
      params.set('filter[user_email][_eq]', filters.email);
    }

    return this.http.get<{ data?: AuditLogRecord[] }>(
      `${environment.API_URL}/items/audit_logs?${params.toString()}`,
      { withCredentials: true }
    ).pipe(
      map(res => res.data ?? [])
    );
  }

  private applyLogs(logs: AuditLogRecord[]) {
    this.logs = logs.map((log) => this.mapToAuditLog(log));
    this.cdr.detectChanges();
  }

  private mapToAuditLog(log: AuditLogRecord): AuditLog {
    const timestamp = this.formatTimestamp(log.timestamp ?? '');
    const metadata = this.parseMetadata(log.metadata ?? log.meta);
    const adminResponse = this.extractAdminResponse(log, metadata);
    const responseTimestamp = this.formatTimestamp(
      log.response_at ?? log.responded_at ?? log.response_timestamp ?? ''
    );

    return {
      user: this.formatUserEmail(log),
      type: log.type ?? 'General',
      description: log.description ?? log.details ?? '',
      timestamp,
      metadata,
      adminResponse,
      responseTimestamp: adminResponse ? responseTimestamp : '',
      responseBy: this.formatResponder(log)
    };
  }

  private formatTimestamp(value: string | number | Date): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    const datePart = date.toLocaleDateString('en-CA');
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  // Admin/reviewer-only: resolves a typed email to a Directus user id so a
  // submitted audit log can reference the user relation instead of a raw email.
  // Both callers are gated behind isAdminUser / canReviewLogs, so this lookup is
  // intentionally cross-tenant; there is no business_profile/workspace id in this
  // component to scope by. `fields` is already restricted to `id` (no PII pulled).
  private resolveUserId(email: string) {
    if (!email) {
      return of(null);
    }

    const params = new URLSearchParams({
      'filter[email][_eq]': email,
      'fields': 'id',
      'limit': '1'
    });
    const url = `${environment.API_URL}/users?${params.toString()}`;

    return this.http.get<{ data?: Array<{ id?: string }> }>(
      url,
      { withCredentials: true }
    ).pipe(
      timeout(15000),
      map(res => (Array.isArray(res?.data) ? res.data[0]?.id : null) ?? null),
      catchError((err) => {
        // Surface enough to diagnose without leaking the looked-up email or URL.
        console.error('[audit-logs] resolve user id failed:', {
          status: typeof err?.status === 'number' ? err.status : 0
        });
        // Re-throw so each caller's existing error handler decides the fallback.
        return throwError(() => err);
      })
    );
  }

  private createLog(payload: CreateAuditLogPayload, _unused: null) {
    return this.http.post(
      `${environment.API_URL}/items/audit_logs`,
      payload,
      { withCredentials: true }
    );
  }

  badgeClass(type: string): string {
    const normalized = (type ?? '').toLowerCase();
    if (normalized.includes('stable')) {
      return 'badge-stable';
    }
    if (normalized.includes('focus')) {
      return 'badge-low';
    }
    if (normalized.includes('fatigue')) {
      return 'badge-fatigue';
    }
    if (normalized.includes('risk')) {
      return 'badge-risk';
    }
    return '';
  }

  private formatUserEmail(log: AuditLogRecord): string {
    if (typeof log.user_email === 'string' && log.user_email) {
      return log.user_email;
    }

    if (typeof log.user === 'string' && log.user) {
      return log.user;
    }

    if (typeof log.user === 'object' && log.user) {
      const user = log.user as Record<string, unknown>;
      if (typeof user['email'] === 'string' && user['email']) {
        return user['email'];
      }
    }

    return 'Unknown';
  }

  private parseMetadata(value: unknown): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : undefined;
      } catch {
        return { note: value };
      }
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return undefined;
  }

  private extractAdminResponse(
    log: AuditLogRecord,
    metadata?: Record<string, unknown>
  ): string | undefined {
    const direct = this.firstString(
      log.admin_response,
      log.response,
      log.reply,
      log.admin_reply,
      log.response_text
    );
    if (direct) {
      return direct;
    }

    if (!metadata) {
      return undefined;
    }

    return this.firstString(
      metadata['admin_response'],
      metadata['response'],
      metadata['reply'],
      metadata['admin_reply'],
      metadata['response_text']
    );
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return undefined;
  }

  private formatResponder(log: AuditLogRecord): string {
    const responder = log.response_by ?? log.responder ?? log.admin ?? log.responded_by;
    if (typeof responder === 'string') {
      return responder;
    }
    if (typeof responder === 'object' && responder) {
      const record = responder as Record<string, unknown>;
      if (typeof record['email'] === 'string' && record['email']) {
        return record['email'];
      }
      if (typeof record['name'] === 'string' && record['name']) {
        return record['name'];
      }
    }
    return '';
  }

  private roleName(user: any): string {
    return typeof user?.role?.name === 'string' ? user.role.name : '';
  }

  private roleId(user: any): string {
    const id = typeof user?.role === 'string' ? user.role : user?.role?.id;
    return typeof id === 'string' ? id : '';
  }
}

type AuditLog = {
  user: string;
  type: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  adminResponse?: string;
  responseTimestamp?: string;
  responseBy?: string;
};

type AuditLogRecord = {
  user?: unknown;
  user_name?: string;
  created_by?: string;
  user_id?: string;
  user_email?: string;
  response?: string;
  admin_response?: string;
  reply?: string;
  admin_reply?: string;
  response_text?: string;
  response_at?: string;
  responded_at?: string;
  response_timestamp?: string;
  response_by?: unknown;
  responder?: unknown;
  admin?: unknown;
  responded_by?: unknown;
  type?: string;
  description?: string;
  details?: string;
  timestamp?: string;
  date_created?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type CreateAuditLogPayload = {
  user?: string;
  type: string;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
};
