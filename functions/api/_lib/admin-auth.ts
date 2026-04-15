/**
 * Admin role-based permission system.
 *
 * Roles:
 * - super:     Full access to all operations
 * - content:   Content management + MPAA rating management
 * - source:    Source management + NAS cache + Telegram channels
 * - community: User management + reports + adult services + blacklist
 *
 * Validates: Requirement 55.4
 */

// ── Types ─────────────────────────────────────────────────────

export type AdminRole = 'super' | 'content' | 'source' | 'community';

export type AdminAction =
  // Content management
  | 'content:list'
  | 'content:delete'
  | 'content:edit'
  // MPAA rating management
  | 'rating:view'
  | 'rating:edit'
  // Source management
  | 'source:list'
  | 'source:add'
  | 'source:edit'
  | 'source:delete'
  | 'source:test'
  // NAS cache management
  | 'cache:status'
  | 'cache:clear'
  | 'cache:destroy'
  | 'cache:config'
  // Telegram channel management
  | 'telegram:list'
  | 'telegram:add'
  | 'telegram:edit'
  | 'telegram:delete'
  | 'telegram:fetch'
  // User management
  | 'user:list'
  | 'user:view'
  | 'user:ban'
  | 'user:unban'
  | 'user:reset_password'
  // Report management
  | 'report:list'
  | 'report:resolve'
  // Adult service management
  | 'service:list'
  | 'service:edit_status'
  // Blacklist management
  | 'blacklist:list'
  | 'blacklist:add'
  | 'blacklist:remove'
  // Dashboard
  | 'dashboard:view'
  // Logs
  | 'log:view'
  // System
  | 'system:announcement';

// ── Permission map ────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminAction>> = {
  super: new Set<AdminAction>([
    // super has ALL permissions — populated below
  ]),

  content: new Set<AdminAction>([
    'dashboard:view',
    'log:view',
    'content:list',
    'content:delete',
    'content:edit',
    'rating:view',
    'rating:edit',
  ]),

  source: new Set<AdminAction>([
    'dashboard:view',
    'log:view',
    'source:list',
    'source:add',
    'source:edit',
    'source:delete',
    'source:test',
    'cache:status',
    'cache:clear',
    'cache:destroy',
    'cache:config',
    'telegram:list',
    'telegram:add',
    'telegram:edit',
    'telegram:delete',
    'telegram:fetch',
  ]),

  community: new Set<AdminAction>([
    'dashboard:view',
    'log:view',
    'user:list',
    'user:view',
    'user:ban',
    'user:unban',
    'user:reset_password',
    'report:list',
    'report:resolve',
    'service:list',
    'service:edit_status',
    'blacklist:list',
    'blacklist:add',
    'blacklist:remove',
  ]),
};

// Build super permissions as the union of all actions
const ALL_ACTIONS: AdminAction[] = [
  'content:list', 'content:delete', 'content:edit',
  'rating:view', 'rating:edit',
  'source:list', 'source:add', 'source:edit', 'source:delete', 'source:test',
  'cache:status', 'cache:clear', 'cache:destroy', 'cache:config',
  'telegram:list', 'telegram:add', 'telegram:edit', 'telegram:delete', 'telegram:fetch',
  'user:list', 'user:view', 'user:ban', 'user:unban', 'user:reset_password',
  'report:list', 'report:resolve',
  'service:list', 'service:edit_status',
  'blacklist:list', 'blacklist:add', 'blacklist:remove',
  'dashboard:view', 'log:view', 'system:announcement',
];

// Override super with all actions
(ROLE_PERMISSIONS.super as Set<AdminAction>) = new Set(ALL_ACTIONS);

// ── Public API ────────────────────────────────────────────────

/**
 * Check whether an admin role has permission to perform an action.
 *
 * `super` role always returns true for any action.
 *
 * @param role   The admin's role (super | content | source | community)
 * @param action The action to check
 * @returns true if the role is allowed to perform the action
 */
export function hasPermission(role: string, action: AdminAction): boolean {
  // super always has full access
  if (role === 'super') return true;

  const permissions = ROLE_PERMISSIONS[role as AdminRole];
  if (!permissions) return false;

  return permissions.has(action);
}

/**
 * Get all actions permitted for a given role.
 */
export function getPermissions(role: string): AdminAction[] {
  if (role === 'super') return [...ALL_ACTIONS];

  const permissions = ROLE_PERMISSIONS[role as AdminRole];
  if (!permissions) return [];

  return [...permissions];
}

/**
 * Validate that a string is a valid admin role.
 */
export function isValidRole(role: string): role is AdminRole {
  return role === 'super' || role === 'content' || role === 'source' || role === 'community';
}
