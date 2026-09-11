import { isScanEligibleRole } from './scan-eligibility';

describe('isScanEligibleRole', () => {
  it('treats employee as scan eligible regardless of casing or whitespace', () => {
    expect(isScanEligibleRole(' employee ')).toBe(true);
    expect(isScanEligibleRole('EMPLOYEE')).toBe(true);
  });

  it('does not treat management roles as employee scan eligible', () => {
    expect(isScanEligibleRole('manager')).toBe(false);
    expect(isScanEligibleRole('hr')).toBe(false);
    expect(isScanEligibleRole('owner')).toBe(false);
    expect(isScanEligibleRole(null)).toBe(false);
  });
});
