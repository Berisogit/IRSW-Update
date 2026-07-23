import { getActiveMembershipStatusValues, resolveOrganizationIdForHydration, resolveRoleForHydration } from '../utils/authHydration';

describe('AuthContext hydration membership fallback', () => {
  it('falls back to the user profile organization when claims are missing', () => {
    const memberships = [{ organizationId: 'org-123', role: 'manager', status: 'ACTIVE' }];
    const userDocData = { organizationId: 'org-456' };

    expect(resolveOrganizationIdForHydration(undefined, userDocData, memberships)).toBe('org-456');
  });

  it('falls back to a single membership when claims and profile organization are missing', () => {
    const memberships = [{ organizationId: 'org-123', role: 'manager', status: 'ACTIVE' }];

    expect(resolveOrganizationIdForHydration(undefined, null, memberships)).toBe('org-123');
  });

  it('uses both active-status variants when resolving memberships', () => {
    expect(getActiveMembershipStatusValues()).toEqual(['active', 'ACTIVE']);
  });

  it('falls back to a membership role when claims and profile role are missing', () => {
    expect(resolveRoleForHydration(undefined, undefined, ['manager'])).toBe('manager');
  });
});
