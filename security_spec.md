# Security Specification for Multi-Tenant Hospitality SaaS

## 1. Data Invariants

1. **Global Safety Net**: Default deny for all reads and writes.
2. **Tenant Isolation**: Operations are restricted to the `organizationId` matching the user's role in the `organizationUsers` collection.
3. **Role Validation (Admin)**: `system_admin` users (as validated by global user doc `globalRole`) have complete access to all organizations.
4. **Role Validation (Organization Level)**: Organization-level roles (`OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`) are verified via the `/organizations/{orgId}/organizationUsers/{userId}` subcollection equivalent structure or root `organizationUsers` where `organizationId` matches.
5. **No Spoofing**: Document ID matching the Auth ID is enforced for `users/{userId}`.
6. **No Phantom Writes**: Relational integrity checked. Creating an entity belonging to an org requires the org to exist.
7. **Role-Based Access Control (RBAC)**:
    - **System Admin**: Full access.
    - **Owner**: Full access to own org. Cannot alter global user roles.
    - **Manager**: Full access to own org data except billing/subscriptions. Cannot change Owner role.
    - **Cashier**: Can read tables, read menu, create/update orders, create payments. Cannot delete orders.
    - **Waiter**: Can read tables, read menu, create/update orders (Draft/Pending/Serving).
    - **Kitchen**: Can read orders, update order status to Ready.
8. **Soft Deletion**: `deletedAt` is used. Entities are rarely hard deleted.
9. **Atomic State Protection**: Final states (e.g. `CLOSED` for orders) cannot be altered except by Owner.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to act as another user by passing a different `uid` in the JSON data compared to `request.auth.uid`.
2. **State Shortcutting**: Updating an order status directly from `DRAFT` to `CLOSED` without payment.
3. **Tenant Bleeding**: A user from `Org A` tries to read or write to `Org B`.
4. **Resource Poisoning**: Pushing a 2MB string into a `description` field.
5. **Privilege Escalation**: Attempting to update own `role` to `OWNER` in `organizationUsers`.
6. **Orphaned Write**: Creating an order for a non-existent `tableId`.
7. **PII Extraction**: Non-manager fetching the `contactEmail` of the organization.
8. **Value Poisoning**: Putting an array of strings in a `price: number` field.
9. **Shadow Payload**: Passing `isVerified: true` implicitly when creating an order.
10. **Ghost Collection**: Accessing an undocumented collection.
11. **Client Delegation Bypass**: Attempting a `list` query without standard `where("organizationId", "==", ...)` forcing a blanket read.
12. **Immutable Field Tampering**: Attempting to change `createdAt` on an update.

