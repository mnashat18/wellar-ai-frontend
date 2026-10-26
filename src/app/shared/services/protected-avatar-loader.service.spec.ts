import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { ProtectedAvatarLoaderService } from './protected-avatar-loader.service';
import { environment } from '../../../environments/environment';

const API_URL = environment.API_URL;

describe('ProtectedAvatarLoaderService', () => {
  let service: ProtectedAvatarLoaderService;
  let httpMock: HttpTestingController;
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProtectedAvatarLoaderService);
    httpMock = TestBed.inject(HttpTestingController);
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-1');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    service.clear();
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('loads protected avatar blobs with credentials and creates an object URL', async () => {
    const resultPromise = firstValueFrom(service.load('avatar-1'));
    const request = httpMock.expectOne(`${API_URL}/wellar/files/avatar-1`);

    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['avatar'], { type: 'image/png' }));

    await expect(resultPromise).resolves.toBe('blob:avatar-1');
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the previous object URL when replacing an avatar', async () => {
    const first = firstValueFrom(service.load('avatar-1'));
    httpMock.expectOne(`${API_URL}/wellar/files/avatar-1`).flush(new Blob(['one']));
    await first;

    createObjectUrlSpy.mockReturnValue('blob:avatar-2');
    const second = firstValueFrom(service.load('avatar-2'));
    httpMock.expectOne(`${API_URL}/wellar/files/avatar-2`).flush(new Blob(['two']));
    await second;

    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:avatar-1');
  });

  it('returns null on failure and retries the same avatar ID successfully', async () => {
    const failed = firstValueFrom(service.load('avatar-1'));
    httpMock.expectOne(`${API_URL}/wellar/files/avatar-1`).flush(null, {
      status: 403,
      statusText: 'Forbidden'
    });
    await expect(failed).resolves.toBeNull();

    createObjectUrlSpy.mockReturnValue('blob:avatar-retry');
    const retried = firstValueFrom(service.load('avatar-1'));
    httpMock.expectOne(`${API_URL}/wellar/files/avatar-1`).flush(new Blob(['retry']));
    await expect(retried).resolves.toBe('blob:avatar-retry');
  });

  it('shares a pending request for repeated loads of the same avatar ID', async () => {
    const first = firstValueFrom(service.load('avatar-1'));
    const second = firstValueFrom(service.load('avatar-1'));
    const request = httpMock.expectOne(`${API_URL}/wellar/files/avatar-1`);
    expect(request.request.withCredentials).toBe(true);
    request.flush(new Blob(['avatar'], { type: 'image/png' }));

    await expect(Promise.all([first, second])).resolves.toEqual(['blob:avatar-1', 'blob:avatar-1']);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it('does not request the same missing avatar again during the session', async () => {
    const first = firstValueFrom(service.load('missing-avatar'));
    httpMock.expectOne(`${API_URL}/wellar/files/missing-avatar`).flush(null, {
      status: 404,
      statusText: 'Not Found'
    });
    await expect(first).resolves.toBeNull();

    await expect(firstValueFrom(service.load('missing-avatar'))).resolves.toBeNull();
    httpMock.expectNone(`${API_URL}/wellar/files/missing-avatar`);
  });
});
