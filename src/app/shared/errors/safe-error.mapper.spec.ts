import { SafeErrorMapper } from './safe-error.mapper';

describe('SafeErrorMapper', () => {
  const mapper = new SafeErrorMapper();

  const expectSafe = (error: unknown, kind: string, status?: number): void => {
    const result = mapper.map(error);

    expect(result.kind).toBe(kind);
    expect(result.status).toBe(status);
    expect(result.userMessage).not.toContain('DirectusException');
    expect(result.userMessage).not.toContain('AxiosError');
    expect(result.cause).toBe(error);
  };

  it('maps network HTTP failures', () => {
    expectSafe({ status: 0, message: 'Http failure response for /api: 0 Unknown Error' }, 'network');
    expect(mapper.map({ status: 0 }).retryable).toBe(true);
  });

  it('maps timeout errors before generic transport handling', () => {
    expectSafe({ name: 'TimeoutError', message: 'Timeout has occurred' }, 'timeout');
    expect(mapper.map({ code: 'ETIMEDOUT' }).retryable).toBe(true);
  });

  it.each([
    [401, 'authentication'],
    [403, 'authorization'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'validation'],
    [500, 'server'],
    [503, 'server']
  ])('maps HTTP status %s to %s', (status, kind) => {
    expectSafe({ status, error: { message: 'DirectusException: technical details' } }, kind, status);
  });

  it('maps common transport codes after HTTP status handling', () => {
    expect(mapper.map({ code: 'ERR_NETWORK' }).kind).toBe('network');
    expect(mapper.map({ code: 'ECONNABORTED' }).kind).toBe('timeout');
  });

  it('maps unknown and malformed values safely', () => {
    expectSafe(new Error('Unexpected database stack trace'), 'unknown');
    expectSafe(null, 'unknown');
    expectSafe({ error: [] }, 'unknown');
  });

  it('recognizes OrganizationApiError contracts by domain code', () => {
    const error = {
      name: 'OrganizationApiError',
      code: 'conflict',
      status: 409,
      userMessage: 'DirectusException: duplicate organization'
    };

    const result = mapper.map(error);

    expect(result.kind).toBe('conflict');
    expect(result.status).toBe(409);
    expect(result.code).toBe('conflict');
    expect(result.userMessage).toBe('This change conflicts with the current workspace state.');
    expect(result.cause).toBe(error);
  });

  it('recognizes WorkspaceContextApiError contracts by domain code', () => {
    const error = {
      name: 'WorkspaceContextApiError',
      code: 'unauthorized',
      status: 401,
      userMessage: 'backend token detail'
    };

    const result = mapper.map(error);

    expect(result.kind).toBe('authentication');
    expect(result.status).toBe(401);
    expect(result.userMessage).toBe('Your session has expired. Please sign in again.');
  });

  it('never exposes technical backend messages by default', () => {
    const technicalMessage = 'DirectusException: SQLSTATE[23505] secret_table token=abc';
    const result = mapper.map({ status: 500, error: { message: technicalMessage } });

    expect(result.userMessage).toBe('Something went wrong on our end. Please try again later.');
    expect(result.userMessage).not.toContain(technicalMessage);
    expect(result.cause).toEqual({ status: 500, error: { message: technicalMessage } });
  });
});
