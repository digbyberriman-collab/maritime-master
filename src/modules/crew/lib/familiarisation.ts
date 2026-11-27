/**
 * Familiarisation rules (X1-10; gap/04 C63, W11; DECISIONS D-X1-6). Pure:
 * no imports with code, so the SQL test can load this file through
 * scripts/db/lib/load-ts.mjs and compare every rule with its SQL mirror in
 * 20261124061000_crew_familiarisation.sql case by case.
 *
 * A record moves Open (nothing ticked) -> In progress (first tick) ->
 * Awaiting signatures (every item ticked) -> Completed (the required
 * signatures: the crew member's and the supervisor's, as the template asked
 * when the record was opened). Overdue is computed: past the due date and
 * not completed. A supervisor of the person's department reopens a
 * completed or signed record with a reason (its signatures are cleared);
 * a record started by mistake (open, nothing ticked) is deleted.
 *
 * SQL mirrors:
 *   decideStatus          familiarisation_status_decide
 *   isOverdue             familiarisation_overdue
 *   checkAction           familiarisation_action_check
 *   decideActor           familiarisation_actor_decide
 *   normaliseSections     familiarisation_sections_normalise
 *   mapLegacyStatus       familiarization_records_status_guard (the legacy mapping)
 */

export const FAMILIARISATION_STATUSES = ['open', 'in_progress', 'awaiting_signatures', 'completed'] as const;
export type FamiliarisationStatus = (typeof FAMILIARISATION_STATUSES)[number];

export const FAMILIARISATION_ACTIONS = ['tick', 'sign_crew', 'sign_supervisor', 'reopen', 'delete'] as const;
export type FamiliarisationAction = (typeof FAMILIARISATION_ACTIONS)[number];

/** What a record's state allows ('ok') or why not (a 22023 refusal of the definers). */
export type ActionCheck =
  | 'ok'
  | 'record_completed'
  | 'record_signed'
  | 'signature_not_required'
  | 'items_open'
  | 'already_signed'
  | 'not_reopenable'
  | 'not_deletable'
  | 'action_unknown';

/** Who the caller is ('ok') or why they may not act (a 42501 refusal of the definers). */
export type ActorCheck = 'ok' | 'not_permitted' | 'own_record' | 'out_of_department' | 'no_login';

/** familiarisation_supervisor_scope: who may sign as supervisor and reopen. */
export type SupervisorScope = 'ok' | 'out_of_department' | 'own_record' | 'not_permitted';

export const isFamiliarisationStatus = (value: unknown): value is FamiliarisationStatus =>
  typeof value === 'string' && (FAMILIARISATION_STATUSES as readonly string[]).includes(value);

/**
 * The status of a record (familiarisation_status_decide): nothing ticked
 * (or no items) is open, some ticked in progress, every item ticked awaiting
 * the required signatures, then completed. A missing flag means required.
 */
export function decideStatus(
  total: number | null,
  done: number | null,
  requiresCrew: boolean | null,
  crewSigned: boolean | null,
  requiresSupervisor: boolean | null,
  supervisorSigned: boolean | null,
): FamiliarisationStatus {
  const t = total ?? 0;
  const d = done ?? 0;
  if (t <= 0 || d <= 0) return 'open';
  if (d < t) return 'in_progress';
  if (((requiresCrew ?? true) && !(crewSigned ?? false)) || ((requiresSupervisor ?? true) && !(supervisorSigned ?? false))) {
    return 'awaiting_signatures';
  }
  return 'completed';
}

/** Overdue (familiarisation_overdue): past the due date and not completed. Dates are `yyyy-MM-dd`. */
export function isOverdue(status: string | null, due: string | null, today: string | null): boolean {
  return (status ?? '') !== 'completed' && due !== null && today !== null && due < today;
}

/** Whether a record's state allows an action (familiarisation_action_check). */
export function checkAction(
  action: string,
  status: string | null,
  done: number | null,
  crewSigned: boolean | null,
  supervisorSigned: boolean | null,
  requiresCrew: boolean | null,
  requiresSupervisor: boolean | null,
): ActionCheck {
  const anySigned = (crewSigned ?? false) || (supervisorSigned ?? false);
  switch (action) {
    case 'tick':
      if (status === 'completed') return 'record_completed';
      if (anySigned) return 'record_signed';
      return 'ok';
    case 'sign_crew':
      if (!(requiresCrew ?? true)) return 'signature_not_required';
      if (status === 'completed') return 'record_completed';
      if (status !== 'awaiting_signatures') return 'items_open';
      if (crewSigned ?? false) return 'already_signed';
      return 'ok';
    case 'sign_supervisor':
      if (!(requiresSupervisor ?? true)) return 'signature_not_required';
      if (status === 'completed') return 'record_completed';
      if (status !== 'awaiting_signatures') return 'items_open';
      if (supervisorSigned ?? false) return 'already_signed';
      return 'ok';
    case 'reopen':
      if (status === 'completed') return 'ok';
      if (status === 'awaiting_signatures' && anySigned) return 'ok';
      return 'not_reopenable';
    case 'delete':
      if (status === 'open' && (done ?? 0) === 0 && !anySigned) return 'ok';
      return 'not_deletable';
    default:
      return 'action_unknown';
  }
}

/**
 * Whether the caller may take an action from who they are
 * (familiarisation_actor_decide): own (the record is theirs), hasLogin (the
 * person has a sign-in), the capabilities on the record's vessel and the
 * supervisor scope. Tick: edit, or own with view_own. Crew signature: own,
 * a login and view_own. Supervisor signature and reopen: never own, the
 * supervisor scope. Delete: create.
 */
export function decideActor(
  action: string,
  own: boolean | null,
  hasLogin: boolean | null,
  viewOwn: boolean | null,
  canEdit: boolean | null,
  canCreate: boolean | null,
  supervisorScope: string | null,
): ActorCheck {
  switch (action) {
    case 'tick':
      if (canEdit ?? false) return 'ok';
      if ((own ?? false) && (viewOwn ?? false)) return 'ok';
      return 'not_permitted';
    case 'sign_crew':
      if (!(own ?? false)) return 'not_permitted';
      if (!(hasLogin ?? false)) return 'no_login';
      if (!(viewOwn ?? false)) return 'not_permitted';
      return 'ok';
    case 'sign_supervisor':
    case 'reopen':
      if (own ?? false) return 'own_record';
      if ((supervisorScope ?? 'not_permitted') === 'ok') return 'ok';
      if (supervisorScope === 'out_of_department' || supervisorScope === 'own_record') return supervisorScope;
      return 'not_permitted';
    case 'delete':
      return (canCreate ?? false) ? 'ok' : 'not_permitted';
    default:
      return 'not_permitted';
  }
}

/** The legacy statuses the old page and trigger wrote, as the record guard maps them. */
export function mapLegacyStatus(status: string | null | undefined): string {
  const key = (status ?? '').trim().toLowerCase();
  switch (key) {
    case '':
    case 'not_started':
      return 'open';
    case 'in_progress':
    case 'overdue':
      return 'in_progress';
    case 'completed':
      return 'completed';
    default:
      return status ?? '';
  }
}

// ---------------------------------------------------------------- sections

/** Trims ASCII whitespace (space, tab, line breaks, form feed, vertical tab), as the SQL mirror's btrim does. */
export function trimText(text: string): string {
  return text.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
}

/** Length in characters (code points), as SQL length() counts them. */
const charLength = (text: string): number => [...text].length;

export interface FamiliarisationSection {
  section_name: string;
  checklist_items: string[];
  required_days?: number;
}

export const SECTION_LIMITS = { sections: 30, items: 60, name: 120, item: 300, days: 365 } as const;

export type SectionsProblem =
  | 'sections_required'
  | 'too_many_sections'
  | 'section_invalid'
  | 'section_name_required'
  | 'section_name_too_long'
  | 'section_duplicate'
  | 'section_items_required'
  | 'too_many_items'
  | 'item_invalid'
  | 'section_days_invalid';

export type SectionsResult = { ok: true; sections: FamiliarisationSection[] } | { ok: false; problem: SectionsProblem; section: number | null };

/**
 * A template's sections checked and normalised (familiarisation_sections_
 * normalise): 1 to 30 sections, each a name (1-120, unique in any case) and
 * 1 to 60 items of 1-300 characters, an optional whole number of days
 * (0-365). Texts are trimmed. `section` is 1-based (null for the list).
 */
export function normaliseSections(input: unknown): SectionsResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, problem: 'sections_required', section: null };
  if (input.length > SECTION_LIMITS.sections) return { ok: false, problem: 'too_many_sections', section: null };
  const out: FamiliarisationSection[] = [];
  const names = new Set<string>();
  for (let i = 0; i < input.length; i += 1) {
    const n = i + 1;
    const raw: unknown = input[i];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problem: 'section_invalid', section: n };
    const s = raw as Record<string, unknown>;
    const name = typeof s.section_name === 'string' ? trimText(s.section_name) : '';
    if (name === '') return { ok: false, problem: 'section_name_required', section: n };
    if (charLength(name) > SECTION_LIMITS.name) return { ok: false, problem: 'section_name_too_long', section: n };
    if (names.has(name.toLowerCase())) return { ok: false, problem: 'section_duplicate', section: n };
    names.add(name.toLowerCase());
    const items = s.checklist_items;
    if (!Array.isArray(items) || items.length === 0) return { ok: false, problem: 'section_items_required', section: n };
    if (items.length > SECTION_LIMITS.items) return { ok: false, problem: 'too_many_items', section: n };
    const list: string[] = [];
    for (const item of items) {
      if (typeof item !== 'string') return { ok: false, problem: 'item_invalid', section: n };
      const text = trimText(item);
      if (text === '' || charLength(text) > SECTION_LIMITS.item) return { ok: false, problem: 'item_invalid', section: n };
      list.push(text);
    }
    let days: number | undefined;
    if (s.required_days !== undefined && s.required_days !== null) {
      const d = s.required_days;
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > SECTION_LIMITS.days) {
        return { ok: false, problem: 'section_days_invalid', section: n };
      }
      days = d;
    }
    out.push(days === undefined ? { section_name: name, checklist_items: list } : { section_name: name, checklist_items: list, required_days: days });
  }
  return { ok: true, sections: out };
}

/** The number of items of a template's sections (any shape: legacy rows are read leniently). */
export function sectionItemCount(sections: unknown): number {
  if (!Array.isArray(sections)) return 0;
  let n = 0;
  for (const s of sections) {
    if (s && typeof s === 'object' && Array.isArray((s as { checklist_items?: unknown }).checklist_items)) {
      n += (s as { checklist_items: unknown[] }).checklist_items.length;
    }
  }
  return n;
}

/**
 * The checklist items a record starts with: the chosen template's own
 * sections (the C63 fix; the legacy page always copied the default
 * sections). Order: section by section, item by item (section * 1000 +
 * item), as familiarisation_open_record numbers them. Legacy rows are read
 * leniently: blank names become "Checklist", non-text items are skipped.
 */
export function checklistItemsFromSections(
  sections: unknown,
): { section_name: string; item_text: string; item_order: number }[] {
  if (!Array.isArray(sections)) return [];
  const out: { section_name: string; item_text: string; item_order: number }[] = [];
  sections.forEach((raw, si) => {
    if (!raw || typeof raw !== 'object') return;
    const s = raw as { section_name?: unknown; checklist_items?: unknown };
    const name = (typeof s.section_name === 'string' && s.section_name.trim()) || 'Checklist';
    if (!Array.isArray(s.checklist_items)) return;
    let ii = 0;
    for (const item of s.checklist_items) {
      if (typeof item !== 'string' || item.trim() === '') continue;
      ii += 1;
      out.push({ section_name: name.slice(0, 120), item_text: item.trim().slice(0, 300), item_order: (si + 1) * 1000 + ii });
    }
  });
  return out;
}

/** Items grouped by section, in item order (the record page). */
export function groupBySection<T extends { section_name: string; item_order: number }>(items: readonly T[]): { name: string; items: T[] }[] {
  const groups: { name: string; items: T[] }[] = [];
  const byName = new Map<string, { name: string; items: T[] }>();
  for (const item of [...items].sort((a, b) => a.item_order - b.item_order)) {
    let g = byName.get(item.section_name);
    if (!g) {
      g = { name: item.section_name, items: [] };
      byName.set(item.section_name, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

/** Progress in per cent (0 when there is nothing to tick). */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(done, total) * 100) / total);
}

/** `due` + n days, date-only in, date-only out (no time zone shifts). */
export function addDaysDateOnly(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `today` to `due` (negative when past). */
export function daysUntil(due: string, today: string): number {
  const [y1, m1, d1] = due.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

// ---------------------------------------------------------------- refusals

/** One STORM sentence for each refusal code the familiarisation definers raise (used when no DETAIL came back). */
export const FAMILIARISATION_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  record_completed: 'This familiarisation is completed. Reopen it to change the checklist.',
  record_signed: 'This familiarisation has a signature. Reopen it to change the checklist.',
  signature_not_required: 'This familiarisation does not need that signature.',
  items_open: 'Tick every item before signing.',
  already_signed: 'This signature is already there.',
  not_reopenable: 'Only a completed familiarisation, or one with a signature, is reopened.',
  not_deletable: 'Only an open familiarisation with nothing ticked is deleted.',
  not_permitted: "You don't have permission to do that.",
  own_record: 'You cannot supervise your own familiarisation.',
  out_of_department: 'You supervise familiarisation in your own department only.',
  no_login: 'The crew member signs once they have a sign-in.',
  record_exists: 'This person already has this familiarisation open.',
  not_on_vessel: "This person is not on the vessel's crew.",
  template_inactive: 'This template is not in use on this vessel.',
  template_empty: 'This template has no items to tick yet.',
  template_not_found: 'This template could not be found on this vessel.',
  record_not_found: 'This familiarisation record could not be found.',
  reason_required: 'Say why it is reopened.',
  variant_exists: 'This vessel already has its own version of that template.',
  familiarisation_engine_only: 'Familiarisation is changed on its pages in STORM.',
});

/** What a rights code means on a disabled control (the record page's hints). */
export function actionHint(code: string): string | null {
  if (code === 'ok') return null;
  return FAMILIARISATION_REFUSALS[code] ?? FAMILIARISATION_REFUSALS.not_permitted;
}

// ---------------------------------------------------------------- STORM presets (T-15)

export interface FamiliarisationPreset {
  key: 'arrival_24h' | 'vessel_two_weeks';
  name: string;
  description: string;
  dueWithinDays: number;
  sections: FamiliarisationSection[];
}

/**
 * STORM's fleet-wide starting points (T-15), written for STORM: a safety
 * familiarisation to finish within a day of joining, and a vessel and job
 * familiarisation for the first two weeks. The editor copies one into a new
 * template; nothing is seeded.
 */
export const FAMILIARISATION_PRESETS: readonly FamiliarisationPreset[] = Object.freeze([
  {
    key: 'arrival_24h',
    name: '24-hour safety familiarisation',
    description: 'What every person on board needs to know before taking up duties: alarms, muster, escape and the basics of staying safe.',
    dueWithinDays: 1,
    sections: [
      {
        section_name: 'Alarms and muster',
        checklist_items: [
          'Recognise the general emergency alarm and the fire alarm',
          'Find your muster station and your lifejacket',
          'Know your duties on the muster list',
          'Know how to raise the alarm for a fire, a person overboard or flooding',
        ],
      },
      {
        section_name: 'Escape and life-saving equipment',
        checklist_items: [
          'Walk the escape routes from your cabin and your place of work',
          'Locate the liferafts, the rescue boat and the tender stations',
          'Locate lifebuoys, immersion suits and emergency escape breathing devices',
        ],
      },
      {
        section_name: 'Fire-fighting and first aid',
        checklist_items: [
          'Locate the fire extinguishers and fire stations near your work and cabin',
          'Locate the first-aid kits and the medical locker',
          'Know where the emergency stops and fire dampers are',
        ],
      },
      {
        section_name: 'Working safely',
        checklist_items: [
          "Read the vessel's safety and environmental policy",
          'Know the permit-to-work and isolation rules',
          'Know the drug and alcohol policy',
          'Know who your head of department and the safety officer are',
        ],
      },
    ],
  },
  {
    key: 'vessel_two_weeks',
    name: 'Two-week vessel familiarisation',
    description: 'The vessel, its routines and your department, completed with your head of department during your first two weeks.',
    dueWithinDays: 14,
    sections: [
      {
        section_name: 'The vessel',
        checklist_items: [
          'Tour of the bridge, engine room, crew areas and guest areas',
          'General arrangement and fire-control plans',
          'Watertight doors: where they are and how they close',
        ],
      },
      {
        section_name: 'Operations',
        checklist_items: [
          'Watchkeeping and handover routine',
          'Radios, telephones and the public address system',
          'Tender, toy and water-sport launch and recovery',
          'Mooring, anchoring and passerelle operations',
        ],
      },
      {
        section_name: 'Your department',
        checklist_items: [
          'Department procedures and checklists',
          'The equipment you use: operation and safe isolation',
          'Maintenance and defect reporting',
          'Stores, ordering and stock counts',
        ],
      },
      {
        section_name: 'Safety management',
        checklist_items: [
          'The safety management system and where to find it',
          'Reporting a near miss, an incident or a non-conformity',
          'Garbage, sewage and oil record rules',
          'Security duties and access control',
        ],
      },
      {
        section_name: 'Hours of rest and welfare',
        checklist_items: [
          'Recording your hours of rest in STORM',
          'Leave, rotation and crew mess arrangements',
          'The complaints procedure and welfare contacts',
        ],
      },
    ],
  },
]);
