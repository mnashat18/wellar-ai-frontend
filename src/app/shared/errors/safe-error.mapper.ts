import type { AppErrorKind, NormalizedAppError } from './app-error.types';

type ErrorRecord = Record<string, unknown>;

const USER_MESSAGES: Record<AppErrorKind, string> = {
  network: 'We couldn’t reach the server. Check your connection and try again.',
  timeout: 'The request took too long. Please try again.',
  authentication: 'Your session has expired. Please sign in again.',
  authorization: 'You don’t have permission to perform this action.',
  validation: 'Please review your entries and try again.',
  conflict: 'This change conflicts with the current workspace state.',
  not_found: 'The requested item could not be found.',
  server: 'Something went wrong on our end. Please try again later.',
  unknown: 'Something went wrong. Please try again.'
};

const RETRYABLE_KINDS = new Set<AppErrorKind>(['network', 'timeout', 'server', 'unknown']);

const DOMAIN_CODES: Record<string, AppErrorKind> = {
  unauthorized: 'authentication',
  authentication: 'authentication',
  forbidden: 'authorization',
  authorization: 'authorization',
  not_found: 'not_found',
  conflict: 'conflict',
  validation: 'validation',
  network_error: 'network',
  network: 'network',
  timeout: 'timeout',
  timeout_error: 'timeout',
  server_error: 'server',
  server: 'server'
};

const TRANSPORT_CODES: Record<string, AppErrorKind> = {
  ECONNABORTED: 'timeout',
  ETIMEDOUT: 'timeout',
  ERR_NETWORK: 'network',
  ERR_INTERNET_DISCONNECTED: 'network',
  ENETUNREACH: 'network',
  ECONNRESET: 'network'
};

const VALID_KINDS = new Set<AppErrorKind>([
  'network',
  'timeout',
  'authentication',
  'authorization',
  'validation',
  'conflict',
  'not_found',
  'server',
  'unknown'
]);

export class SafeErrorMapper {
  map(error: unknown): NormalizedAppError {
    const record = this.asRecord(error);
    const typed = this.mapKnownTypedError(record, error);
    if (typed) {
      return typed;
    }

    const timeoutKind = this.detectTimeout(record);
    if (timeoutKind) {
      return this.normalized('timeout', record, error);
    }

    const status = this.readStatus(record);
    const statusKind = this.kindFromStatus(status);
    if (statusKind) {
      return this.normalized(statusKind, record, error, status);
    }

    const transportCode = this.readCode(record);
    const transportKind = transportCode ? TRANSPORT_CODES[transportCode.toUpperCase()] : undefined;
    if (transportKind) {
      return this.normalized(transportKind, record, error);
    }

    return this.normalized('unknown', record, error);
  }

  private mapKnownTypedError(record: ErrorRecord | null, error: unknown): NormalizedAppError | null {
    if (!record) {
      return null;
    }

    const code = this.readCode(record);
    const explicitKind = this.readString(record['kind']);
    const domainKind = code ? DOMAIN_CODES[code.toLowerCase()] : undefined;
    const isKnownDomainError =
      this.readString(record['name']) === 'OrganizationApiError' ||
      this.readString(record['name']) === 'WorkspaceContextApiError' ||
      Object.prototype.hasOwnProperty.call(record, 'userMessage');

    if (!isKnownDomainError && (!explicitKind || !VALID_KINDS.has(explicitKind as AppErrorKind))) {
      return null;
    }

    const kind =
      (explicitKind && VALID_KINDS.has(explicitKind as AppErrorKind)
        ? explicitKind
        : domainKind) as AppErrorKind | undefined;
    if (!kind) {
      return null;
    }

    return this.normalized(kind, record, error);
  }

  private detectTimeout(record: ErrorRecord | null): boolean {
    if (!record) {
      return false;
    }

    const name = this.readString(record['name'])?.toLowerCase();
    const code = this.readString(record['code'])?.toUpperCase();
    const message = this.readString(record['message'])?.toLowerCase() ?? '';

    return (
      name === 'timeouterror' ||
      code === 'TIMEOUT' ||
      code === 'TIMEOUT_ERROR' ||
      message.includes('timeout') ||
      message.includes('timed out')
    );
  }

  private kindFromStatus(status: number | undefined): AppErrorKind | null {
    if (typeof status !== 'number') {
      return null;
    }
    if (status === 0) {
      return 'network';
    }
    if (status === 401) {
      return 'authentication';
    }
    if (status === 403) {
      return 'authorization';
    }
    if (status === 404) {
      return 'not_found';
    }
    if (status === 409) {
      return 'conflict';
    }
    if (status === 400 || status === 422) {
      return 'validation';
    }
    if (status >= 500 && status <= 599) {
      return 'server';
    }
    return null;
  }

  private normalized(
    kind: AppErrorKind,
    record: ErrorRecord | null,
    cause: unknown,
    status = this.readStatus(record)
  ): NormalizedAppError {
    const code = this.readCode(record);
    return {
      kind,
      ...(typeof status === 'number' && status > 0 ? { status } : {}),
      ...(code ? { code } : {}),
      userMessage: USER_MESSAGES[kind],
      retryable: RETRYABLE_KINDS.has(kind),
      cause
    };
  }

  private readStatus(record: ErrorRecord | null): number | undefined {
    if (!record) {
      return undefined;
    }

    const status = record['status'] ?? record['statusCode'];
    return typeof status === 'number' && Number.isFinite(status) && status >= 0 ? status : undefined;
  }

  private readCode(record: ErrorRecord | null): string | undefined {
    if (!record) {
      return undefined;
    }

    const directCode = this.readString(record['code']);
    if (directCode) {
      return directCode;
    }

    const nestedError = this.asRecord(record['error']);
    const nestedCode = this.readString(nestedError?.['code']);
    if (nestedCode) {
      return nestedCode;
    }

    const nestedDetails = this.asRecord(nestedError?.['error']);
    return this.readString(nestedDetails?.['code']);
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private asRecord(value: unknown): ErrorRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as ErrorRecord)
      : null;
  }
}

export const safeErrorMapper = new SafeErrorMapper();

export function mapSafeError(error: unknown): NormalizedAppError {
  return safeErrorMapper.map(error);
}

export function isDuplicateEmailRegistrationError(error: unknown): boolean {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const status = record?.['status'];
  if (status !== 400 && status !== 409 && status !== 422) {
    return false;
  }

  const message = JSON.stringify(record).toLowerCase();
  return (
    message.includes('record_not_unique') && message.includes('email') ||
    message.includes('field email has to be unique')
  );
}
