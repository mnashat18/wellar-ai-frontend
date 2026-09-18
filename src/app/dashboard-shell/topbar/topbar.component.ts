import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { CompanyContextService } from '../../core/context/company-context.service';
import { getWorkspaceRouteByUrlPath } from '../../ia/wellar-ia';
import { GlobalNotificationsPanelComponent } from '../../shared/ui/global-notifications-panel/global-notifications-panel.component';

@Component({
  selector: 'app-dashboard-topbar',
  standalone: true,
  imports: [CommonModule, RouterLink, GlobalNotificationsPanelComponent],
  templateUrl: './topbar.component.html'
})
export class TopbarComponent implements OnInit, OnDestroy {
  private readonly companyContext = inject(CompanyContextService);
  private readonly router = inject(Router);
  private routeSubscription?: Subscription;

  readonly state$ = this.companyContext.state$;

  @Input() pageTitle = 'Workspace';
  @Input() pageDescription = '';

  ngOnInit(): void {
    this.updatePageContext();
    this.routeSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updatePageContext();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  private updatePageContext(): void {
    const page = getWorkspaceRouteByUrlPath(this.router.url.split('?')[0]);
    if (!page) {
      return;
    }

    this.pageTitle = page.title;
    this.pageDescription = page.description;
  }
}
