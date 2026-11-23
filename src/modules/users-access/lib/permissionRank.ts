/**
 * The order of the override levels, shared by the Users & Access list and
 * detail hooks: when a person has more than one granted override row for a
 * module, the highest one is the one the evaluators honour, so it is the one
 * both pages show (a lower row next to it must never hide it).
 */
import type { PermissionLevel } from './presets';

/** admin 3, edit 2, view 1, none 0 (anything else counts as none). */
export function permissionRank(level?: PermissionLevel | string | null): number {
  return level === 'admin' ? 3 : level === 'edit' ? 2 : level === 'view' ? 1 : 0;
}

const isLevel = (value: unknown): value is PermissionLevel => value === 'view' || value === 'edit' || value === 'admin';

/**
 * Module key → the highest granted level among `rows`. Rows with an unknown
 * level are ignored.
 */
export function highestPermissionByModule(
  rows: ReadonlyArray<{ module_key: string; permission: string | null }>,
  into: Record<string, PermissionLevel | null> = {},
): Record<string, PermissionLevel | null> {
  for (const row of rows) {
    if (!isLevel(row.permission)) continue;
    if (permissionRank(row.permission) > permissionRank(into[row.module_key])) into[row.module_key] = row.permission;
  }
  return into;
}
