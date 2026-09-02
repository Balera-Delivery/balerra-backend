export const Roles = {
  CUSTOMER: 'CUSTOMER',
  RIDER: 'RIDER',
  ADMIN: 'ADMIN',
} as const;

export type RoleType = (typeof Roles)[keyof typeof Roles];

export const AccountStatuses = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type AccountStatusType = (typeof AccountStatuses)[keyof typeof AccountStatuses];

export const RiderAvailabilities = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
} as const;

export type RiderAvailabilityType = (typeof RiderAvailabilities)[keyof typeof RiderAvailabilities];
