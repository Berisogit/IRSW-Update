export interface MembershipLike {
  organizationId?: string | null;
  status?: string | null;
}

export function getActiveMembershipStatusValues(): string[] {
  return ['active', 'ACTIVE'];
}

export function normalizeRoleValue(role: unknown): string | null {
  if (typeof role === 'string') {
    const normalized = role.trim().toLowerCase();
    return normalized || null;
  }

  return null;
}

export function resolveRoleForHydration(
  claimsRole?: unknown,
  userDocRole?: unknown,
  membershipRoles: Array<unknown> = [],
  staffRole?: unknown
): string | null {
  for (const candidate of [claimsRole, userDocRole, ...membershipRoles, staffRole]) {
    const normalized = normalizeRoleValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export interface UserDocumentLike {
  organizationId?: string | null;
  defaultOrganizationId?: string | null;
}

export function resolveOrganizationIdForHydration(
  claimsOrganizationId: string | null | undefined,
  userDocData: UserDocumentLike | null | undefined,
  memberships: MembershipLike[] = []
): string | null {
  const claimOrganizationId = (claimsOrganizationId || '').trim();
  if (claimOrganizationId) {
    return claimOrganizationId;
  }

  const userOrganizationId = ((userDocData?.organizationId || userDocData?.defaultOrganizationId || '') as string).trim();
  if (userOrganizationId) {
    return userOrganizationId;
  }

  const activeMemberships = (memberships || []).filter((membership) => {
    const status = (membership.status || '').toString();
    return !status || getActiveMembershipStatusValues().includes(status) || getActiveMembershipStatusValues().includes(status.toLowerCase());
  });

  if (activeMemberships.length === 0) {
    return null;
  }

  const uniqueOrganizations = [...new Set(activeMemberships
    .map((membership) => (membership.organizationId || '').trim())
    .filter(Boolean))];

  if (uniqueOrganizations.length > 1) {
    return null;
  }

  return uniqueOrganizations[0] || null;
}
