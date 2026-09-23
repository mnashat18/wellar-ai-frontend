import { Injectable, OnDestroy } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CompanyContextService, type ActiveMembershipContext } from '../core/context/company-context.service';
import { AuthService } from './auth';
import { InviteService } from './invites';
import { PostAuthWelcomeService } from './post-auth-welcome.service';

@Injectable({ providedIn: 'root' })
export class PostLoginRoutingService implements OnDestroy {
  private readonly resolveTimeoutMs = 12000;
  private inviteClaimInProgress = false;
  private claimFlowPromise: Promise<string> | null = null;
  private inviteClaimGeneration = 0;
  private readonly logoutResetHandler = (): void => this.reset();

  constructor(
    private auth: AuthService,
    private companyContext: CompanyContextService,
    private invites: InviteService,
    private postAuthWelcome: PostAuthWelcomeService
  ) {
    if (typeof window !== 'undefined') {
      window.addEventListener('wellar-auth-logout-complete', this.logoutResetHandler);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('wellar-auth-logout-complete', this.logoutResetHandler);
    }
  }

  reset(): void {
    this.inviteClaimGeneration += 1;
    this.inviteClaimInProgress = false;
    this.claimFlowPromise = null;
  }

  async resolveDestination(): Promise<string> {
    const user = await this.auth.getCurrentUserAfterRestore();
    if (!user?.id) {
      return '/?auth=login';
    }
    this.invites.debugFlow('auth success');

    const inviteTokenFromUrl = this.invites.getInviteTokenFromCurrentUrl();
    const pendingInviteToken = inviteTokenFromUrl || this.invites.getPendingInviteToken();
    if (pendingInviteToken) {
      this.invites.setPendingInviteToken(pendingInviteToken);
      this.invites.debugFlow('pending token found');
      return await this.resolvePendingInviteDestination(pendingInviteToken);
    }

    const explicitRedirect = this.sanitizeExplicitRedirect(this.auth.consumePostAuthRedirect(''));

    if (explicitRedirect) {
      return explicitRedirect;
    }

    try {
      await this.withTimeout(
        this.refreshAuthAndWorkspaceContext({ force: true }),
        this.resolveTimeoutMs,
        'Timed out while restoring workspace context.'
      );
    } catch {
      return this.buildBestEffortRoute();
    }

    const context = this.companyContext.snapshot().context;
    if (context.activeBusinessProfileId && this.isDashboardRole(context.activeMemberRole)) {
      this.invites.debugFlow('final route decision', { route: '/app/dashboard' });
      return '/app/dashboard';
    }

    try {
      return await this.withTimeout(
        this.resolveDestinationFromMembership(),
        this.resolveTimeoutMs,
        'Timed out while resolving destination from membership.'
      );
    } catch {
      return this.buildBestEffortRoute();
    }
  }

  async resolveDestinationStrict(): Promise<string> {
    const user = await this.auth.getCurrentUserAfterRestore();
    if (!user?.id) {
      throw new Error('Authentication is required before opening organization access.');
    }

    this.invites.debugFlow('auth success');

    const inviteTokenFromUrl = this.invites.getInviteTokenFromCurrentUrl();
    const pendingInviteToken = inviteTokenFromUrl || this.invites.getPendingInviteToken();
    if (pendingInviteToken) {
      this.invites.setPendingInviteToken(pendingInviteToken);
      this.invites.debugFlow('pending token found');
      return await this.resolvePendingInviteDestination(pendingInviteToken);
    }

    await this.withTimeout(
      this.refreshAuthAndWorkspaceContext({ force: true, failOnError: true }),
      this.resolveTimeoutMs,
      'Timed out while restoring workspace context.'
    );

    const context = this.companyContext.snapshot().context;
    if (context.activeBusinessProfileId && this.isDashboardRole(context.activeMemberRole)) {
      const explicitRedirect = this.sanitizeExplicitRedirect(this.auth.consumePostAuthRedirect(''));
      const route = this.authorizePostAuthRedirect(explicitRedirect, context.activeMemberRole) || '/app/dashboard';
      this.invites.debugFlow('final route decision', { route: this.safeRouteForDebug(route) });
      return route;
    }

    const resolvedRoute = await this.withTimeout(
      this.resolveDestinationFromMembership(),
      this.resolveTimeoutMs,
      'Timed out while resolving destination from membership.'
    );
    const refreshedContext = this.companyContext.snapshot().context;
    const explicitRedirect = this.sanitizeExplicitRedirect(this.auth.consumePostAuthRedirect(''));
    return this.authorizePostAuthRedirect(explicitRedirect, refreshedContext.activeMemberRole) || resolvedRoute;
  }

  async navigateToPostInviteDestination(
    claimed?: { businessProfileId: string | null; memberRole: string | null; departmentId: string | null },
    logToken?: string | null
  ): Promise<string> {
    const memberships = await this.companyContext.refreshMemberships({ force: true });
    const context = this.companyContext.snapshot().context;
    const targetMembership = this.pickPreferredMembership(
      memberships,
      claimed?.businessProfileId ?? context.activeBusinessProfileId ?? null,
      context.activeBusinessProfileId
    );

    if (targetMembership) {
      try {
        await this.companyContext.activateFromMembership(targetMembership as any);
      } catch {
        return '/app/workspace-access';
      }

      const activatedContext = this.companyContext.snapshot().context;
      if (activatedContext.activeBusinessProfileId !== this.normalizeId(targetMembership.business_profile)) {
        return '/app/workspace-access';
      }
    }

    const snapshotContext = this.companyContext.snapshot().context;
    const resolvedProfileId =
      snapshotContext.activeBusinessProfileId ??
      this.normalizeId(targetMembership?.business_profile);
    const resolvedRole =
      this.normalizeRole(snapshotContext.activeMemberRole) ||
      this.normalizeRole(targetMembership?.member_role);

    if (resolvedProfileId && resolvedRole) {
      const inviteSuccessRoute = this.resolveClaimSuccessRoute(resolvedRole);
      if (inviteSuccessRoute) {
        this.queueInviteWelcome(inviteSuccessRoute);
        this.invites.debugFlow('final route decision', {
          route: this.safeRouteForDebug(inviteSuccessRoute),
          role: resolvedRole
        });
        return '/app/welcome';
      }
    }

    return await this.resolveDestinationFromMembership(undefined, memberships, logToken);
  }

  async refreshAuthAndWorkspaceContext(options: { force?: boolean; failOnError?: boolean } = {}): Promise<ActiveMembershipContext[]> {
    const forceRefresh = options.force ?? true;
    try {
      const restoration = await firstValueFrom(
        this.companyContext.restoreWorkspaceContext(forceRefresh)
      );
      this.invites.debugFlow('restored authentication and workspace context');
      this.invites.debugFlow('restored memberships', {
        count: restoration.memberships.length
      });
      return restoration.memberships;
    } catch (error) {
      if (options.failOnError) {
        throw error;
      }
      this.invites.debugFlow('workspace context restoration failed');
      return [];
    }
  }

  cancelPendingInviteClaim(): void {
    this.reset();
  }

  async refreshAuthTokenAfterInviteRoleChange(): Promise<void> {
    this.invites.debugFlow('refreshing auth token after role change');

    try {
      const refreshedToken = await this.auth.refreshAuthTokenWithStoredRefreshToken();
      if (!refreshedToken) {
        throw new Error('No refreshed token was issued.');
      }
      this.invites.debugFlow('refreshed token');
    } catch (error) {
      const message = 'Workspace joined successfully. Please sign in again to activate your access.';
      this.invites.debugFlow('refresh auth token failed', {
        error: error instanceof Error ? error.message : String(error ?? '')
      });
      this.auth.clearAuthState();
      this.auth.setAuthNotice(message);
      throw new Error(message);
    }
  }

  private async resolveDestinationFromMembership(
    claimed?: { businessProfileId: string | null; memberRole: string | null; departmentId: string | null },
    memberships?: ActiveMembershipContext[],
    logToken?: string | null
  ): Promise<string> {
    const activeMemberships = (memberships ?? await this.companyContext.getActiveMembershipsForCurrentUser()).filter(
      (membership) => String(membership.status ?? '').toLowerCase() === 'active'
    );
    const context = this.companyContext.snapshot().context;
    if (context.activeBusinessProfileId && this.isDashboardRole(context.activeMemberRole)) {
      this.invites.debugFlow('final route decision', {
        route: '/app/dashboard',
        activeMemberRole: context.activeMemberRole
      });
      return '/app/dashboard';
    }

    const claimedProfileId = claimed?.businessProfileId ?? null;
    const activeProfileId = claimedProfileId ?? context.activeBusinessProfileId ?? null;
    const targetMembership = this.pickPreferredMembership(activeMemberships, claimedProfileId, context.activeBusinessProfileId);

    if (targetMembership) {
      try {
        await this.companyContext.activateFromMembership(targetMembership as any);
      } catch {
        return '/app/workspace-access';
      }

      const activatedContext = this.companyContext.snapshot().context;
      if (activatedContext.activeBusinessProfileId !== this.normalizeId(targetMembership.business_profile)) {
        return '/app/workspace-access';
      }
    }

    const refreshedContext = this.companyContext.snapshot().context;
    const resolvedProfileId =
      activeProfileId ??
      refreshedContext.activeBusinessProfileId ??
      this.normalizeId(targetMembership?.business_profile);
    const resolvedRole =
      this.normalizeRole(claimed?.memberRole) ||
      this.normalizeRole(refreshedContext.activeMemberRole) ||
      this.normalizeRole(targetMembership?.member_role);
    const nextRoute = this.resolveRouteForRole(resolvedProfileId, resolvedRole, Boolean(claimed));

    this.invites.debugFlow('final route decision', {
      route: this.safeRouteForDebug(nextRoute),
      activeMemberRole: resolvedRole
    });
    return nextRoute;
  }

  private normalizeRole(value: unknown): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'manger') return 'manager';
    return normalized;
  }

  private pickPreferredMembership(
    memberships: ActiveMembershipContext[],
    claimedProfileId?: string | null,
    activeProfileId?: string | null
  ): ActiveMembershipContext | null {
    if (!memberships.length) {
      return null;
    }

    const membershipFromClaim =
      memberships.find((membership) =>
        claimedProfileId &&
        this.normalizeId(membership.business_profile) === claimedProfileId
      ) ?? null;
    if (membershipFromClaim) {
      return membershipFromClaim;
    }

    const membershipFromActiveProfile =
      memberships.find((membership) =>
        activeProfileId &&
        this.normalizeId(membership.business_profile) === activeProfileId
      ) ?? null;
    if (membershipFromActiveProfile) {
      return membershipFromActiveProfile;
    }

    return (
      memberships.find((membership) => this.isDashboardRole(membership.member_role)) ??
      memberships.find((membership) => this.normalizeRole(membership.member_role) === 'employee') ??
      memberships[0] ??
      null
    );
  }

  private resolveRouteForRole(
    activeBusinessProfileId: string | null,
    role: string,
    claimedInvite = false
  ): string {
    if (!activeBusinessProfileId) {
      return '/app/workspace-access';
    }

    if (this.isDashboardRole(role)) {
      return '/app/dashboard';
    }

    if (role === 'employee') {
      return '/app/workspace-access?joined=1';
    }

    return claimedInvite ? '/app/workspace-access?joined=1' : '/app/workspace-access';
  }

  private resolveClaimSuccessRoute(role: string): string | null {
    if (this.isDashboardRole(role)) {
      return '/app/dashboard';
    }

    if (role === 'employee') {
      return '/app/workspace-access?joined=1';
    }

    if (role) {
      return '/app/dashboard';
    }

    return null;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (value && typeof value === 'object') {
      return this.normalizeId((value as { id?: unknown }).id);
    }
    return null;
  }

  private isDashboardRole(value: unknown): boolean {
    const role = this.normalizeRole(value);
    return role === 'owner' || role === 'hr' || role === 'manager';
  }

  private async resolvePendingInviteDestination(token: string): Promise<string> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return '/app/workspace-access';
    }

    this.invites.setPendingInviteToken(normalizedToken);

    if (this.invites.hasClaimSucceededForToken(normalizedToken)) {
      this.invites.markClaimCompleted(normalizedToken);
      this.invites.debugFlow('claim already succeeded for token');
      return await this.resolveAttemptedInviteDestination(normalizedToken);
    }

    if (this.invites.isClaimInProgressForToken(normalizedToken) && this.claimFlowPromise) {
      return await this.claimFlowPromise;
    }

    if (this.invites.hasClaimAttemptedForToken(normalizedToken)) {
      this.invites.debugFlow('claim already attempted for token');
      return `/invites/claim?token=${encodeURIComponent(normalizedToken)}`;
    }

    const authReady = await this.ensureInviteClaimAuthReady(normalizedToken);
    if (!authReady) {
      this.invites.setInviteClaimError('Your session was not ready to accept the invite.');
      return `/?invite=1&token=${encodeURIComponent(normalizedToken)}&auth=signup`;
    }

    if (this.inviteClaimInProgress && this.claimFlowPromise) {
      return await this.claimFlowPromise;
    }

    this.invites.clearInviteClaimError();
    this.inviteClaimInProgress = true;
    const generation = ++this.inviteClaimGeneration;
    this.claimFlowPromise = this.claimPendingInvite(normalizedToken, generation);

    try {
      return await this.claimFlowPromise;
    } finally {
      this.inviteClaimInProgress = false;
      this.claimFlowPromise = null;
    }
  }

  private async claimPendingInvite(token: string, generation: number): Promise<string> {
    this.invites.markClaimAttemptedForToken(token);
    this.invites.markClaimInProgressForToken(token);

    try {
      const claimResult = await firstValueFrom(this.invites.claimInvite(token));
      if (!this.isCurrentInviteClaimGeneration(generation)) {
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }
      this.invites.debugFlow('claim success', {
        memberRole: claimResult.memberRole
      });
      await this.refreshAuthTokenAfterInviteRoleChange();
      if (!this.isCurrentInviteClaimGeneration(generation)) {
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }
      const activated = await this.activateClaimedInviteMembership(claimResult.businessProfileId);
      if (!activated) {
        this.invites.clearClaimInProgressForToken(token);
        this.invites.setInviteClaimError('Invite accepted, but workspace activation could not be confirmed. Please retry.');
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }
      await this.refreshAuthAndWorkspaceContext({ force: true, failOnError: true });
      if (!this.isCurrentInviteClaimGeneration(generation)) {
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }
      const activatedContext = this.companyContext.snapshot().context;
      if (
        !claimResult.businessProfileId ||
        activatedContext.activeBusinessProfileId !== this.normalizeId(claimResult.businessProfileId) ||
        !activatedContext.activeMemberRole
      ) {
        this.invites.clearClaimInProgressForToken(token);
        this.invites.setInviteClaimError('Invite accepted, but workspace context could not be confirmed. Please retry.');
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }

      const nextRoute = await this.resolveFinalRouteAfterClaim(token, claimResult);
      if (!this.isCurrentInviteClaimGeneration(generation)) {
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }
      if (nextRoute.startsWith('/invites/claim')) {
        this.invites.clearClaimInProgressForToken(token);
        return nextRoute;
      }

      this.invites.markClaimSucceededForToken(token);
      this.invites.markClaimCompleted(token);
      this.invites.clearPendingInviteToken();
      this.invites.clearClaimAttemptedForToken(token);
      this.invites.clearClaimInProgressForToken(token);
      this.invites.clearInviteClaimError();
      return nextRoute;
    } catch (error) {
      if (!this.isCurrentInviteClaimGeneration(generation)) {
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }
      this.invites.clearClaimInProgressForToken(token);

      if ((error as { message?: unknown })?.message === 'Workspace joined successfully. Please sign in again to activate your access.') {
        return '/?auth=login';
      }

      const detail = this.invites.extractInviteErrorDetail(error) ?? this.invites.getReadableInviteError(error);
      if (!this.invites.isAlreadyClaimedError(error)) {
        this.invites.setInviteClaimError(detail);
        return `/invites/claim?token=${encodeURIComponent(token)}`;
      }

      this.invites.setInviteClaimError(detail);
      return `/invites/claim?token=${encodeURIComponent(token)}`;
    }
  }

  private async ensureInviteClaimAuthReady(token: string): Promise<boolean> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await this.companyContext.refreshCurrentUser({ force: true });

      const context = this.companyContext.snapshot().context;
      const ready =
        context.authInitialized &&
        context.isAuthenticated &&
        this.auth.isSessionEstablished() &&
        Boolean(context.currentUser?.id);

      if (ready) {
        this.invites.debugFlow('auth token ready', {
          attempt: attempt + 1
        });
        return true;
      }

      await this.sleep(250);
    }

    return false;
  }

  private async refreshInviteContexts(): Promise<void> {
    await this.refreshAuthAndWorkspaceContext({ force: true });
  }

  private async activateClaimedInviteMembership(businessProfileId: string | null): Promise<boolean> {
    const profileId = this.normalizeId(businessProfileId);
    if (!profileId) {
      this.invites.debugFlow('claim response missing business profile id');
      return false;
    }

    const membership = await this.companyContext.activateClaimedMembershipForCurrentUser(profileId);
    if (!membership?.id) {
      this.invites.debugFlow('claimed active membership not found after claim');
      return false;
    }

    this.invites.debugFlow('claimed active membership activated', {
      memberRole: membership.member_role
    });
    return true;
  }

  private isCurrentInviteClaimGeneration(generation: number): boolean {
    return generation === this.inviteClaimGeneration;
  }

  private async resolveFinalRouteAfterClaim(
    token: string,
    claimed: { businessProfileId: string | null; memberRole: string | null; departmentId: string | null }
  ): Promise<string> {
    const context = this.companyContext.snapshot().context;
    const normalizedContextRole = this.normalizeRole(context.activeMemberRole);
    const activeBusinessProfileId = context.activeBusinessProfileId ?? null;
    const activeMemberRole = normalizedContextRole;

    this.invites.debugFlow('active context resolved', { role: activeMemberRole || null });

    if (activeBusinessProfileId && activeMemberRole) {
      const route = this.resolveClaimedWorkspaceDestination(activeBusinessProfileId, activeMemberRole, true);
      this.queueInviteWelcome(route);
      this.invites.debugFlow('navigating to welcome', { route: this.safeRouteForDebug(route) });
      return '/app/welcome';
    }

    const nextRoute = await this.navigateToPostInviteDestination(claimed, token);
    if (nextRoute === '/app/dashboard' || nextRoute === '/app/workspace-access?joined=1') {
      this.invites.debugFlow('navigating to welcome', { route: this.safeRouteForDebug(nextRoute) });
      return nextRoute;
    }

    try {
      await this.refreshInviteContexts();
    } catch {
      // Continue with best-effort snapshot checks below.
    }

    const contextAfterMembership = this.companyContext.snapshot().context;
    const profileAfterMembership = contextAfterMembership.activeBusinessProfileId ?? null;
    const roleAfterMembership = this.normalizeRole(contextAfterMembership.activeMemberRole);
    if (profileAfterMembership && roleAfterMembership) {
      const route = this.resolveClaimedWorkspaceDestination(profileAfterMembership, roleAfterMembership, true);
      this.queueInviteWelcome(route);
      this.invites.debugFlow('navigating to welcome', { route: this.safeRouteForDebug(route) });
      return '/app/welcome';
    }

    this.invites.setInviteClaimError('Invite accepted, but workspace context could not be loaded.');
    return `/invites/claim?token=${encodeURIComponent(token)}`;
  }

  private resolveClaimedWorkspaceDestination(
    activeBusinessProfileId: string | null,
    role: string,
    claimedInvite: boolean
  ): string {
    if (!activeBusinessProfileId) {
      return '/app/workspace-access';
    }

    if (this.isDashboardRole(role)) {
      return '/app/dashboard';
    }

    if (role === 'employee') {
      return '/app/workspace-access?joined=1';
    }

    return claimedInvite ? '/app/dashboard' : '/app/workspace-access';
  }

  private async resolveAttemptedInviteDestination(token: string): Promise<string> {
    try {
      await this.refreshInviteContexts();
    } catch {
      // Keep routing based on whatever context is currently available.
    }

    const context = this.companyContext.snapshot().context;
    if (this.invites.hasClaimSucceededForToken(token) && context.activeBusinessProfileId) {
      this.invites.markClaimCompleted(token);
      this.invites.clearPendingInviteToken();
      this.invites.clearClaimAttemptedForToken(token);
      this.invites.clearClaimInProgressForToken(token);
      this.invites.clearInviteClaimError();
      const role = this.normalizeRole(context.activeMemberRole);
      const route = this.resolveClaimedWorkspaceDestination(context.activeBusinessProfileId, role, true);
      this.queueInviteWelcome(route);
      return '/app/welcome';
    }

    return `/invites/claim?token=${encodeURIComponent(token)}`;
  }

  private queueInviteWelcome(destinationRoute: string): void {
    const context = this.companyContext.snapshot().context;
    this.postAuthWelcome.queueInviteWelcome(
      context.activeBusinessProfileName ?? 'your organization',
      destinationRoute
    );
  }

  private sanitizeExplicitRedirect(path: string): string {
    const normalized = path.trim();
    if (!normalized) {
      return '';
    }

    if (normalized.startsWith('/invites/claim') || normalized.startsWith('/app/invites/claim')) {
      return '';
    }

    return normalized;
  }

  private safeRouteForDebug(path: string): string {
    const normalized = path.trim();
    if (!normalized) {
      return '';
    }
    return normalized.split('?')[0].split('#')[0];
  }

  private authorizePostAuthRedirect(path: string, roleValue: unknown): string {
    const normalized = path.trim();
    if (!normalized) {
      return '';
    }

    const role = this.normalizeRole(roleValue);
    const routePath = normalized.split('?')[0].split('#')[0].toLowerCase();

    if (!routePath.startsWith('/app/')) {
      return '';
    }

    if (role === 'owner' || role === 'hr') {
      return normalized;
    }

    if (role === 'manager') {
      const allowedManagerRoutes = new Set([
        '/app/dashboard',
        '/app/workforce',
        '/app/scan-requests',
        '/app/requests',
        '/app/compliance',
        '/app/alerts',
        '/app/reports',
        '/app/workspace-access'
      ]);
      return allowedManagerRoutes.has(routePath) ? normalized : '';
    }

    if (role === 'employee') {
      return routePath === '/app/workspace-access' ? normalized : '';
    }

    return '';
  }

  private buildBestEffortRoute(): string {
    const context = this.companyContext.snapshot().context;
    const role = this.normalizeRole(context.activeMemberRole);

    if (context.activeBusinessProfileId && this.isDashboardRole(role)) {
      return '/app/dashboard';
    }

    if (context.activeBusinessProfileId && role === 'employee') {
      return '/app/workspace-access?joined=1';
    }

    return '/app/workspace-access';
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
