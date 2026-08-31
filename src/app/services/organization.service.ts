import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth';

export type Organization = {
  id: string;
  name: string;
  industry?: string;
  role?: string;
};

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private api = environment.API_URL;
  private endpointForbidden = false;

  constructor(private http: HttpClient, private auth: AuthService) {}

  getUserOrganization(): Observable<Organization | null> {
    if (this.endpointForbidden) {
      return of(null);
    }

    return this.auth.getVerifiedCurrentUser().pipe(
      switchMap((user) => {
        const userId = typeof user?.id === 'string' ? user.id : null;
        if (!userId) return of(null);
        const params = new URLSearchParams({ 'filter[user][_eq]': userId, 'limit': '1', 'fields': 'id,role,org.id,org.name' });
        return this.http.get<{ data?: Array<any> }>(`${this.api}/items/organization_members?${params.toString()}`, { withCredentials: true });
      }),
      map((res) => {
        const record = res?.data?.[0];
        if (!record?.org) {
          return null;
        }
        return {
          id: record.org.id,
          name: record.org.name,
          industry: record.org.industry,
          role: record.role
        } as Organization;
      }),
      catchError((err) => {
        if (err?.status === 401 || err?.status === 403) {
          this.endpointForbidden = true;
        }
        return of(null);
      })
    );
  }

}
