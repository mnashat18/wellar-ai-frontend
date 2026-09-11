export function isScanEligibleRole(role: string | null | undefined): boolean {
  return String(role ?? '').trim().toLowerCase() === 'employee';
}
