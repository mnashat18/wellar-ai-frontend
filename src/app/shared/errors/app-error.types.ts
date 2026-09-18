export type AppErrorKind =
  | 'network'
  | 'timeout'
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'server'
  | 'unknown';

export interface NormalizedAppError {
  kind: AppErrorKind;
  status?: number;
  code?: string;
  userMessage: string;
  retryable: boolean;
  cause?: unknown;
}
