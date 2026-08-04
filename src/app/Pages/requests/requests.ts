import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { catchError, finalize } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { CompanyContextService } from '../../core/context/company-context.service';
import {
  OperationsWorkflowsService,
  type RequestModalOptions,
  type RequestRow,
  type RequestsPageData,
  type WorkflowMemberOption,
} from '../../services/operations-workflows.service';
import { CardSkeletonLoaderComponent } from '../../shared/ui/card-skeleton-loader/card-skeleton-loader.component';
import { DashboardSectionComponent } from '../../shared/ui/dashboard-section/dashboard-section.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FilterBarShellComponent } from '../../shared/ui/filter-bar-shell/filter-bar-shell.component';
import { KpiCardComponent } from '../../shared/ui/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { TableShellComponent } from '../../shared/ui/table-shell/table-shell.component';
import { TableSkeletonLoaderComponent } from '../../shared/ui/table-skeleton-loader/table-skeleton-loader.component';
import { ViewportDialogComponent } from '../../shared/ui/viewport-dialog/viewport-dialog.component';
type PageState = 'loading' | 'ready' | 'error' | 'scopeUnavailable';
type FeedbackType = 'success' | 'error' | 'info';
type QueueStatus = 'pending' | 'completed' | 'overdue' | 'expired' | 'cancelled' | 'failed';
type FeedbackMessage = { type: FeedbackType; text: string };
type RequestFilters = {
  search: string;
  status: 'all' | QueueStatus;
  requestType: string;
  department: string;
  dueWindow: 'all' | 'today' | 'week' | 'not_set';
  sort: 'newest' | 'dueSoon' | 'overdueFirst';
};
type QueueRow = {
  source: RequestRow;
  status: QueueStatus;
  statusLabel: string;
  statusClass: string;
  requestTypeLabel: string;
  departmentName: string;
  requestedAtLabel: string;
  dueAtLabel: string;
  completedAtLabel: string;
  requestedAtTs: number;
  dueAtTs: number;
};
type QueueSummary = {
  pending: number;
  overdue: number;
  completed: number;
  unsuccessful: number;
  openRequests: number;
  dueToday: number;
  completionRate: number;
};
type ScanRequestForm = { memberId: string; dueAt: string };
@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    FilterBarShellComponent,
    DashboardSectionComponent,
    ErrorStateComponent,
    KpiCardComponent,
    TableShellComponent,
    CardSkeletonLoaderComponent,
    TableSkeletonLoaderComponent,
    ViewportDialogComponent,
  ],
  templateUrl: './requests.html',
  styleUrls: ['./requests.css'],
})
export class RequestsPageComponent implements OnInit, OnDestroy {
  readonly unsupportedWorkflowMessage = 'This action requires an approved server-side workflow.';
  readonly noEligibleRecipientMessage =
    'No verified active HR, Manager, or Employee with a linked account and email is available.';
  readonly openScanRequestConflictMessage =
    'This member already has an open scan request. They must complete it before another request can be sent.';
  pageState: PageState = 'loading';
  loading = false;
  errorMessage = '';
  feedback: FeedbackMessage | null = null;
  pageData: RequestsPageData | null = null;
  requestModalOptions: RequestModalOptions | null = null;
  rows: QueueRow[] = [];
  visibleRows: QueueRow[] = [];
  selectedRequest: QueueRow | null = null;
  resultCountLabel = 'Showing 0 Requests';
  hasActiveFilters = false;
  showCreateModal = false;
  creatingRequest = false;
  requestModalError = '';
  requestModalNotice = '';
  requestModalOptionsLoaded = false;
  modalLoading = false;
  modalError = '';
  modalRequestOptions: RequestModalOptions | null = null;
  modalRequestedMemberId: string | null = null;
  private modalRequestLoadId = 0;
  requestForm: ScanRequestForm = { memberId: '', dueAt: '' };
  summary: QueueSummary = {
    pending: 0,
    overdue: 0,
    completed: 0,
    unsuccessful: 0,
    openRequests: 0,
    dueToday: 0,
    completionRate: 0,
  };
  filters: RequestFilters = {
    search: '',
    status: 'all',
    requestType: '',
    department: '',
    dueWindow: 'all',
    sort: 'newest',
  };
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequestedMembershipId: string | null = null;
  constructor(
    private workflows: OperationsWorkflowsService,
    private companyContext: CompanyContextService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}
  ngOnInit(): void {
    this.pendingRequestedMembershipId = this.extractRequestedMembershipId();
    this.loadPage();
  }
  ngOnDestroy(): void {
    this.setBodyScrollLocked(false);
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
  }
  @HostListener('document:keydown.escape') onEscape(): void {
    if (this.showCreateModal) {
      this.closeCreateModal();
      return;
    }
    if (this.selectedRequest) {
      this.closeRequestDetails();
    }
  }
  get currentRole(): string {
    return String(this.companyContext.snapshot().context.activeMemberRole ?? '').toLowerCase();
  }
  get isManager(): boolean {
    return this.currentRole === 'manager';
  }
  get isOwnerOrHr(): boolean {
    return this.currentRole === 'owner' || this.currentRole === 'hr';
  }
  get pageDescription(): string {
    if (this.isManager) {
      const department = this.managerDepartmentName;
      return department
        ? `Department-scoped request queue for ${department}.`
        : 'Department-scoped request queue.';
    }
    return 'Organization request queue for operational follow-up.';
  }
  get scopeTypeLabel(): string {
    return this.isManager ? 'Department' : 'Organization';
  }
  get scopeNameLabel(): string {
    return this.isManager
      ? this.managerDepartmentName || 'Department scope'
      : this.companyContext.snapshot().context.activeBusinessProfileName || 'Organization';
  }
  get managerDepartmentName(): string {
    return (
      this.companyContext.snapshot().context.activeDepartmentName ||
      this.pageData?.departments?.[0]?.name ||
      ''
    );
  }
  get canCreateRequests(): boolean {
    return this.isOwnerOrHr && this.pageState === 'ready';
  }
  openCreateRequestModal(memberId: string | null = null): void {
    this.openCreateModal(memberId);
  }
  closeCreateRequestModal(): void {
    this.closeCreateModal();
  }
  get loadingRequestModalOptions(): boolean {
    return this.modalLoading;
  }
  get createRequestError(): string {
    return this.requestModalError || this.modalError;
  }
  formatRequestMemberOption(member: WorkflowMemberOption): string {
    return this.memberOptionLabel(member);
  }
  get eligibleRequestMembers(): WorkflowMemberOption[] {
    return this.modalRequestOptions?.members ?? [];
  }
  get showNoEligibleRecipientState(): boolean {
    return (
      this.pageState === 'ready' &&
      this.requestModalOptionsLoaded &&
      !this.requestModalError &&
      this.eligibleRequestMembers.length === 0
    );
  }
  get requestTypeOptions(): string[] {
    return Array.from(new Set(this.rows.map((row) => row.requestTypeLabel).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b),
    );
  }
  get departmentOptions(): Array<{ id: string; name: string }> {
    return this.pageData?.departments ?? [];
  }
  get showFilteredEmpty(): boolean {
    return this.pageState === 'ready' && this.rows.length > 0 && this.visibleRows.length === 0;
  }
  get showQueueEmpty(): boolean {
    return this.pageState === 'ready' && this.rows.length === 0;
  }
  refresh(): void {
    this.loadPage();
  }
  clearFilters(): void {
    this.filters = {
      search: '',
      status: 'all',
      requestType: '',
      department: '',
      dueWindow: 'all',
      sort: 'newest',
    };
    this.recomputeVisibleRows();
  }
  openCreateModal(memberId: string | null = null): void {
    if (!this.canCreateRequests || this.creatingRequest) {
      if (!this.isOwnerOrHr) {
        this.requestModalError = 'Only Owner and HR can create scan requests.';
      }
      this.requestModalNotice = '';
      this.showCreateModal = false;
      this.cdr.detectChanges();
      return;
    }
    const normalizedMemberId = this.normalizeId(memberId);
    const matchedMember = normalizedMemberId
      ? this.eligibleRequestMembers.find((option) => option.member_id === normalizedMemberId)
      : null;
    this.requestForm = { memberId: matchedMember?.member_id ?? '', dueAt: '' };
    this.requestModalError = '';
    this.requestModalNotice = '';
    this.modalError = '';
    this.modalRequestOptions = null;
    this.modalRequestedMemberId = normalizedMemberId || null;
    this.modalLoading = true;
    this.showCreateModal = true;
    this.setBodyScrollLocked(true);
    this.cdr.detectChanges();
    this.loadCreateModalOptions();
  }
  onFiltersChanged(): void {
    this.recomputeVisibleRows();
  }
  openUnsupportedWorkflow(): void {
    this.pushFeedback('info', this.unsupportedWorkflowMessage);
  }
  closeCreateModal(): void {
    if (this.creatingRequest) {
      return;
    }
    this.modalRequestLoadId += 1;
    this.modalRequestedMemberId = null;
    this.showCreateModal = false;
    this.modalLoading = false;
    this.modalError = '';
    this.modalRequestOptions = null;
    this.requestModalError = '';
    this.requestModalNotice = '';
    this.requestForm = { memberId: '', dueAt: '' };
    this.setBodyScrollLocked(Boolean(this.selectedRequest));
    this.cdr.detectChanges();
  }
  retryCreateModalLoad(): void {
    if (!this.showCreateModal) {
      return;
    }
    this.loadCreateModalOptions();
  }
  submitCreateRequest(): void {
    if (!this.canCreateRequests || this.creatingRequest) {
      if (!this.isOwnerOrHr) {
        this.requestModalError = 'Only Owner and HR can create scan requests.';
        this.cdr.detectChanges();
      }
      return;
    }
    const member = this.eligibleRequestMembers.find(
      (option) => option.member_id === this.requestForm.memberId,
    );
    if (!member) {
      this.requestModalError = this.noEligibleRecipientMessage;
      this.cdr.detectChanges();
      return;
    }
    if (this.hasOpenRequestForMember(member.member_id)) {
      this.requestModalError = this.openScanRequestConflictMessage;
      this.cdr.detectChanges();
      return;
    }
    const dueAtInput = String(this.requestForm.dueAt ?? '').trim();
    let dueAt: string | undefined;
    if (dueAtInput) {
      const parsedDueAt = new Date(dueAtInput);
      if (!Number.isFinite(parsedDueAt.getTime())) {
        this.requestModalError = 'Please enter a valid due time.';
        this.cdr.detectChanges();
        return;
      }
      dueAt = parsedDueAt.toISOString();
    }
    this.creatingRequest = true;
    this.requestModalError = '';
    this.cdr.detectChanges();
    const payload: { target_member_id: string; request_type: 'manual'; due_at?: string } = {
      target_member_id: member.member_id,
      request_type: 'manual',
    };
    if (dueAt) {
      payload.due_at = dueAt;
    }
    this.workflows
      .createScanRequest(payload)
      .pipe(
        finalize(() => {
          this.creatingRequest = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.pushFeedback('success', 'Scan request sent successfully.');
          this.creatingRequest = false;
          this.closeCreateModal();
          this.refresh();
        },
        error: (error: unknown) => {
          this.requestModalError = this.toServerSafeError(error, 'Failed to send scan request.');
          this.cdr.detectChanges();
        },
      });
  }
  openRequest(row: QueueRow): void {
    this.selectedRequest = row;
  }
  closeRequestDetails(): void {
    this.selectedRequest = null;
  }
  trackByRequest(index: number, row: QueueRow): string {
    return row.source.id || String(index);
  }
  trackByDepartment(index: number, item: { id: string; name: string }): string {
    return item.id || String(index);
  }
  trackByMember(index: number, item: WorkflowMemberOption): string {
    return item.member_id || String(index);
  }
  hasOpenRequestForMember(memberId: string): boolean {
    const normalizedMemberId = this.normalizeId(memberId);
    if (!normalizedMemberId) {
      return false;
    }
    return this.rows.some(
      (row) =>
        this.isOpenRequestStatus(row.source.lifecycle_status) &&
        this.normalizeId(row.source.target_member_id) === normalizedMemberId,
    );
  }
  memberOptionLabel(member: WorkflowMemberOption): string {
    const openLabel = this.hasOpenRequestForMember(member.member_id) ? ' - Open request' : '';
    const email = member.email || 'Email unavailable';
    return `${member.label} - ${email} - ${this.roleLabel(member.member_role)}${openLabel}`;
  }
  private loadPage(): void {
    const context = this.companyContext.snapshot().context;
    if (context.activeMemberRole === 'manager' && !context.activeDepartmentId) {
      this.pageData = null;
      this.rows = [];
      this.visibleRows = [];
      this.requestModalOptions = null;
      this.requestModalOptionsLoaded = false;
      this.resetSummary();
      this.pageState = 'scopeUnavailable';
      this.loading = false;
      this.errorMessage = '';
      this.cdr.detectChanges();
      return;
    }
    this.pageState = 'loading';
    this.loading = true;
    this.errorMessage = '';
    this.requestModalError = '';
    this.requestModalNotice = '';
    this.requestModalOptionsLoaded = false;
    this.requestModalOptions = null;
    this.cdr.detectChanges();
    const modalOptions$ = this.workflows.getRequestModalOptions().pipe(
      catchError((error: unknown) => {
        this.requestModalError = this.toServerSafeError(
          error,
          'Eligible recipients could not be loaded.',
        );
        return of({ members: [], departments: [] } satisfies RequestModalOptions);
      }),
    );
    forkJoin({ pageData: this.workflows.getRequestsPageData(), modalOptions: modalOptions$ })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ pageData, modalOptions }) => {
          this.pageData = pageData;
          this.rows = this.buildRows(pageData.rows ?? []);
          this.requestModalOptions = modalOptions;
          this.requestModalOptionsLoaded = true;
          this.requestModalNotice =
            modalOptions.members.length > 0 || this.requestModalError
              ? ''
              : this.noEligibleRecipientMessage;
          this.summary = {
            pending: pageData.summary.pending,
            overdue: pageData.summary.overdue,
            completed: pageData.summary.completed,
            unsuccessful:
              (pageData.summary.expired ?? 0) +
              (pageData.summary.cancelled ?? 0) +
              (pageData.summary.failed ?? 0),
            openRequests: pageData.summary.openRequests ?? 0,
            dueToday: pageData.summary.dueToday ?? 0,
            completionRate: pageData.summary.completionRate ?? 0,
          };
          this.recomputeVisibleRows();
          this.syncSelectedRequestAfterLoad();
          this.pageState = 'ready';
          if (this.pendingRequestedMembershipId) {
            const memberId = this.pendingRequestedMembershipId;
            this.pendingRequestedMembershipId = null;
            this.openCreateModal(memberId);
          }
          this.cdr.detectChanges();
        },
        error: (error: unknown) => {
          this.pageData = null;
          this.rows = [];
          this.visibleRows = [];
          this.requestModalOptions = null;
          this.requestModalOptionsLoaded = false;
          this.resetSummary();
          this.errorMessage = this.resolveLoadErrorMessage(error);
          this.pageState = 'error';
          this.cdr.detectChanges();
        },
      });
  }
  private loadCreateModalOptions(): void {
    const loadId = ++this.modalRequestLoadId;
    this.modalError = '';
    this.modalLoading = true;
    this.cdr.detectChanges();
    this.workflows
      .getRequestModalOptions()
      .pipe(
        catchError((error: unknown) => {
          if (loadId === this.modalRequestLoadId && this.showCreateModal) {
            this.modalError = this.toServerSafeError(
              error,
              'Eligible recipients could not be loaded.',
            );
          }
          return of({ members: [], departments: [] } satisfies RequestModalOptions);
        }),
        finalize(() => {
          if (loadId === this.modalRequestLoadId && this.showCreateModal) {
            this.modalLoading = false;
            this.cdr.detectChanges();
          }
        }),
      )
      .subscribe({
        next: (modalOptions) => {
          if (loadId !== this.modalRequestLoadId || !this.showCreateModal) {
            return;
          }
          this.modalRequestOptions = {
            members: [...(modalOptions.members ?? [])],
            departments: [...(modalOptions.departments ?? [])],
          };
          const preselectedMember = this.modalRequestedMemberId
            ? this.modalRequestOptions.members.find(
                (option) => option.member_id === this.modalRequestedMemberId,
              )
            : null;
          if (preselectedMember) {
            this.requestForm.memberId = preselectedMember.member_id;
          }
          this.modalRequestedMemberId = null;
          this.requestModalNotice =
            this.modalRequestOptions.members.length > 0 ? '' : this.noEligibleRecipientMessage;
          this.modalLoading = false;
          this.cdr.detectChanges();
        },
      });
  }
  private buildRows(rows: RequestRow[]): QueueRow[] {
    return (rows ?? []).map((row) => {
      const status = this.resolveStatus(row);
      return {
        source: row,
        status,
        statusLabel: this.statusLabel(status),
        statusClass: this.statusClassForStatus(status),
        requestTypeLabel: this.toDisplayLabel(row.request_type, 'Scan request'),
        departmentName: this.safeText(
          row.department_name,
          this.isManager ? this.managerDepartmentName || 'Department unavailable' : 'Unassigned',
        ),
        requestedAtLabel: this.formatDateTimeLabel(row.requested_at),
        dueAtLabel: row.due_at ? this.formatDateTimeLabel(row.due_at) : 'No due time',
        completedAtLabel: row.completed_at
          ? this.formatDateTimeLabel(row.completed_at)
          : 'Not completed',
        requestedAtTs: this.toTimestamp(row.requested_at),
        dueAtTs: this.toTimestamp(row.due_at),
      } satisfies QueueRow;
    });
  }
  private recomputeVisibleRows(): void {
    const search = this.filters.search.trim().toLowerCase();
    this.hasActiveFilters = this.computeHasActiveFilters();
    let filtered = this.rows.filter((row) => {
      const matchesSearch =
        !search ||
        row.source.target_member_name.toLowerCase().includes(search) ||
        (row.source.target_member_email ?? '').toLowerCase().includes(search) ||
        row.requestTypeLabel.toLowerCase().includes(search) ||
        row.departmentName.toLowerCase().includes(search) ||
        row.source.requested_by_user_name.toLowerCase().includes(search) ||
        row.source.id.toLowerCase().includes(search);
      const matchesStatus = this.filters.status === 'all' || row.status === this.filters.status;
      const matchesType =
        !this.filters.requestType || row.requestTypeLabel === this.filters.requestType;
      const matchesDepartment =
        this.isManager ||
        !this.filters.department ||
        row.source.department_id === this.filters.department;
      const matchesDue = this.matchesDueWindow(row);
      return matchesSearch && matchesStatus && matchesType && matchesDepartment && matchesDue;
    });
    if (this.filters.sort === 'dueSoon') {
      filtered = [...filtered].sort((left, right) => {
        const leftDue = left.dueAtTs || Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAtTs || Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      });
    } else if (this.filters.sort === 'overdueFirst') {
      filtered = [...filtered].sort((left, right) => {
        const leftRank = left.status === 'overdue' ? 0 : 1;
        const rightRank = right.status === 'overdue' ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return (
          (left.dueAtTs || Number.MAX_SAFE_INTEGER) - (right.dueAtTs || Number.MAX_SAFE_INTEGER)
        );
      });
    } else {
      filtered = [...filtered].sort((left, right) => right.requestedAtTs - left.requestedAtTs);
    }
    this.visibleRows = filtered;
    this.resultCountLabel = this.hasActiveFilters
      ? `Showing ${this.visibleRows.length} of ${this.rows.length} Requests`
      : `Showing ${this.rows.length} ${this.rows.length === 1 ? 'Request' : 'Requests'}`;
  }
  private matchesDueWindow(row: QueueRow): boolean {
    if (this.filters.dueWindow === 'all') {
      return true;
    }
    if (this.filters.dueWindow === 'not_set') {
      return !row.dueAtTs;
    }
    const today = this.todayRange();
    if (this.filters.dueWindow === 'today') {
      return row.dueAtTs >= today.start && row.dueAtTs < today.end;
    }
    return row.dueAtTs >= today.start && row.dueAtTs < today.start + 7 * 24 * 60 * 60 * 1000;
  }
  private syncSelectedRequestAfterLoad(): void {
    const selectedRequestId = this.selectedRequest?.source.id;
    if (!selectedRequestId) {
      this.selectedRequest = null;
      return;
    }
    this.selectedRequest = this.rows.find((row) => row.source.id === selectedRequestId) ?? null;
  }
  private resolveStatus(row: RequestRow): QueueStatus {
    if (row.lifecycle_status === 'OPEN_OVERDUE') return 'overdue';
    if (row.lifecycle_status === 'COMPLETED') return 'completed';
    if (row.lifecycle_status === 'EXPIRED') return 'expired';
    if (row.lifecycle_status === 'CANCELLED') return 'cancelled';
    if (row.lifecycle_status === 'FAILED') return 'failed';
    return 'pending';
  }
  private isOpenRequestStatus(lifecycleStatus: string | null | undefined): boolean {
    return lifecycleStatus === 'OPEN_PENDING' || lifecycleStatus === 'OPEN_OVERDUE';
  }
  private statusLabel(status: QueueStatus): string {
    if (status === 'pending') return 'Pending';
    if (status === 'completed') return 'Completed';
    if (status === 'overdue') return 'Overdue';
    if (status === 'expired') return 'Expired';
    if (status === 'failed') return 'Failed';
    return 'Cancelled';
  }
  private statusClassForStatus(status: QueueStatus): string {
    if (status === 'completed') return 'scan-request-status scan-request-status--completed';
    if (status === 'overdue') return 'scan-request-status scan-request-status--overdue';
    if (status === 'failed') return 'scan-request-status scan-request-status--failed';
    if (status === 'expired') return 'scan-request-status scan-request-status--expired';
    if (status === 'cancelled') return 'scan-request-status scan-request-status--neutral';
    return 'scan-request-status scan-request-status--pending';
  }
  private resolveLoadErrorMessage(error: unknown): string {
    const status = (error as { status?: number } | null)?.status ?? 0;
    const message = (error as { message?: string } | null)?.message ?? '';
    if (message.toLowerCase().includes('manager account has no active department')) {
      this.pageState = 'scopeUnavailable';
      return '';
    }
    if (status === 403) {
      return 'Scan requests are unavailable for the current workspace scope.';
    }
    if (message.toLowerCase().includes('workspace')) {
      return 'Select an active workspace before opening Scan Requests.';
    }
    return 'Scan requests could not be loaded.';
  }
  private computeHasActiveFilters(): boolean {
    return Boolean(
      this.filters.search.trim() ||
      this.filters.status !== 'all' ||
      this.filters.requestType ||
      (!this.isManager && this.filters.department) ||
      this.filters.dueWindow !== 'all' ||
      this.filters.sort !== 'newest',
    );
  }
  private resetSummary(): void {
    this.summary = {
      pending: 0,
      overdue: 0,
      completed: 0,
      unsuccessful: 0,
      openRequests: 0,
      dueToday: 0,
      completionRate: 0,
    };
  }
  private todayRange(): { start: number; end: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: start + 24 * 60 * 60 * 1000 };
  }
  private formatDateTimeLabel(value: string | null | undefined): string {
    const timestamp = this.toTimestamp(value);
    if (!timestamp) {
      return 'Unavailable';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(timestamp));
  }
  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  private normalizeId(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const nestedId = record['id'];
      if (typeof nestedId === 'string' || typeof nestedId === 'number') {
        return String(nestedId).trim();
      }
    }
    return '';
  }
  private extractRequestedMembershipId(): string | null {
    const navigationState = this.router.getCurrentNavigation()?.extras.state as
      Record<string, unknown> | undefined;
    const historyState =
      (typeof history !== 'undefined' ? (history.state as Record<string, unknown> | null) : null) ??
      undefined;
    const candidate = this.normalizeId(
      navigationState?.['scanRequestTargetMemberId'] ??
        navigationState?.['workforceTargetMembershipId'] ??
        navigationState?.['workforceRequestTargetMembershipId'] ??
        historyState?.['scanRequestTargetMemberId'] ??
        historyState?.['workforceTargetMembershipId'] ??
        historyState?.['workforceRequestTargetMembershipId'],
    );
    return candidate || null;
  }
  roleLabel(value: string | null | undefined): string {
    const normalized = this.normalizeId(value).toLowerCase();
    if (normalized === 'owner') return 'OWNER';
    if (normalized === 'hr') return 'HR';
    if (normalized === 'manager') return 'MANAGER';
    if (normalized === 'employee') return 'EMPLOYEE';
    return this.safeText(value, 'Unknown');
  }
  private toServerSafeError(error: unknown, fallback: string): string {
    const errorRecord = error as {
      error?: {
        error?: {
          message?: string;
          errors?: Array<{ message?: string; extensions?: { reason?: string } }>;
        };
        message?: string;
        errors?: Array<{ message?: string; extensions?: { reason?: string } }>;
      };
      message?: string;
    } | null;
    const message =
      errorRecord?.error?.errors?.[0]?.extensions?.reason ??
      errorRecord?.error?.errors?.[0]?.message ??
      errorRecord?.error?.error?.errors?.[0]?.extensions?.reason ??
      errorRecord?.error?.error?.errors?.[0]?.message ??
      errorRecord?.error?.error?.message ??
      errorRecord?.error?.message ??
      errorRecord?.message ??
      '';
    const safeMessage = String(message).trim();
    return safeMessage || fallback;
  }
  private toDisplayLabel(value: string | null | undefined, fallback: string): string {
    const clean = this.safeText(value, '');
    if (!clean) {
      return fallback;
    }
    return clean
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ');
  }
  private safeText(value: string | null | undefined, fallback: string): string {
    const clean = String(value ?? '').trim();
    return clean || fallback;
  }
  private normalizeDateTimeInput(value: string | null | undefined): string | null {
    const clean = String(value ?? '').trim();
    if (!clean) {
      return null;
    }
    const parsed = new Date(clean);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  private pushFeedback(type: FeedbackType, text: string): void {
    this.feedback = { type, text };
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
      this.cdr.detectChanges();
    }, 3500);
  }
  private setBodyScrollLocked(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = locked ? 'hidden' : '';
  }
}
