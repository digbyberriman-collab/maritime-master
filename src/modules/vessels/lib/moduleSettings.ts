/**
 * Per-vessel module settings, resolved for the nav (gap/10 IA9, W4;
 * DECISIONS C13, G3, D-01, D-04; spec §5.2). Pure: the hook
 * (../hooks/useVesselModuleSettings.ts) turns `vessel_module_settings` rows
 * into a `ModuleSettingsState`, and `resolveModuleSettings` answers "is this
 * key on?" and "what does this vessel call it?" for every nav surface (tab
 * row, sidebar, route gate, vessel switch, palette).
 *
 * - While the settings load, or after they failed, every key is off (fail
 *   closed): nothing gated by a setting shows or opens until we know.
 * - A missing table (the migration is not applied, D-01) or a missing row
 *   means on.
 * - A row with `enabled = false`, or with `enabled_from` after today, is off.
 * - A dotted key inherits its parents: `technical.jobs` is off whenever
 *   `technical` is.
 * - A label override applies to its exact key only, trimmed; an empty
 *   override keeps the default label.
 */

export interface VesselModuleSetting {
  moduleKey: string;
  enabled: boolean;
  /** `YYYY-MM-DD`; null = on now. */
  enabledFrom: string | null;
  labelOverride: string | null;
}

export type ModuleSettingsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      /** `table-missing`: the table is not in this database yet (D-01), so every module is on. */
      source: 'table' | 'table-missing';
      settings: ReadonlyMap<string, VesselModuleSetting>;
    };

export interface ModuleSettingsResolver {
  status: ModuleSettingsState['status'];
  /** Whether a `vessel_module_settings` key is on for the vessel. False for every key unless `ready`. */
  isModuleOn: (moduleSetting: string) => boolean;
  /** The vessel's label for that exact key, or null for the default. */
  labelFor: (moduleSetting: string) => string | null;
}

/** `technical.jobs` → `['technical', 'technical.jobs']`; empty segments are ignored. */
export function parentModuleKeys(key: string): string[] {
  const parts = key.split('.').filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

/** Today in the browser's local time zone, as `YYYY-MM-DD` (the resolver's `today`). */
export function localIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const NOTHING_ON = (): boolean => false;
const NO_LABEL = (): null => null;

/** Every module on, no labels: tests, and a vessel whose settings table does not exist yet. */
export const ALL_MODULES_ON: ModuleSettingsResolver = Object.freeze({
  status: 'ready' as const,
  isModuleOn: () => true,
  labelFor: NO_LABEL,
});

/** The state for a table that is not in the database yet (D-01): ready, nothing stored. */
export const TABLE_MISSING_STATE: Extract<ModuleSettingsState, { status: 'ready' }> = Object.freeze({
  status: 'ready' as const,
  source: 'table-missing' as const,
  settings: new Map<string, VesselModuleSetting>(),
});

function settingIsOn(setting: VesselModuleSetting | undefined, today: string): boolean {
  if (!setting) return true;
  if (!setting.enabled) return false;
  // ISO dates compare as strings. A malformed date is not a date we can
  // honour, so it does not switch the module off.
  if (setting.enabledFrom && /^\d{4}-\d{2}-\d{2}/.test(setting.enabledFrom) && today < setting.enabledFrom.slice(0, 10)) {
    return false;
  }
  return true;
}

/**
 * The resolver for one vessel's settings. `today` is the local date
 * (`localIsoDate()`), passed in so tests are deterministic.
 */
export function resolveModuleSettings(state: ModuleSettingsState, today: string): ModuleSettingsResolver {
  if (state.status !== 'ready') {
    return { status: state.status, isModuleOn: NOTHING_ON, labelFor: NO_LABEL };
  }
  const { settings } = state;
  return {
    status: 'ready',
    isModuleOn: (moduleSetting: string) =>
      parentModuleKeys(moduleSetting).every((key) => settingIsOn(settings.get(key), today)),
    labelFor: (moduleSetting: string) => settings.get(moduleSetting)?.labelOverride?.trim() || null,
  };
}
