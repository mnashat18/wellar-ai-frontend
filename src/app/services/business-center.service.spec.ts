import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BusinessCenterService, CreateScanRequestResult } from './business-center.service';

describe('BusinessCenterService mutation safety', () => {
  let service: BusinessCenterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BusinessCenterService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(BusinessCenterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('does not duplicate a rejected scan-request mutation', () => {
    let result: CreateScanRequestResult | undefined;

    (service as any).postRequestWithRetry({ requested_for_email: 'tester@example.com' }, null)
      .subscribe((value: CreateScanRequestResult) => { result = value; });

    const request = httpMock.expectOne('https://dash.conntinuity.com/items/requests');
    expect(request.request.method).toBe('POST');
    request.flush(
      { errors: [{ message: 'Invalid field in payload.' }] },
      { status: 400, statusText: 'Bad Request' }
    );

    httpMock.expectNone('https://dash.conntinuity.com/items/requests');
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('Invalid field in payload.');
  });
});
