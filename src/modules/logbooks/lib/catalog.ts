/**
 * Logbook catalogue: the 17 Meridian templated books plus the two operational
 * books (Bell Book, Visitor & Guest Log) that pre-date the Meridian port.
 *
 * Every book is described the same way so the ruled-sheet workspace can open
 * any of them. Book ids are stable Meridian ids; `dbType` is the Postgres
 * `logbook_type` enum value and `slug` is the URL segment.
 */
import {
  Anchor, Bell, BookOpen, Compass, Cog, Droplets, Layers, Leaf, Moon, Radio, Users, Waves, Fuel, Gauge, Bug, ShowerHead,
  type LucideIcon,
} from 'lucide-react';
import {
  detailedBooks, differences, references, volumeFieldsFor,
  type ActorCapacity, type DetailedBook, type FlagDifference, type SourceKey, type TemplateField, type TemplateSection,
} from './templates';

export type SensorType = 'navigation' | 'machinery';

export interface LogbookBook {
  id: string;
  slug: string;
  dbType: string;
  code: string;
  title: string;
  group: string;
  icon: LucideIcon;
  color: string;
  description: string;
  statutory: boolean;
  /** Author capacities allowed to write in this book. The Master can always write. */
  roles: ActorCapacity[];
  sensor?: SensorType;
  sections: TemplateSection[];
  source: SourceKey;
  basis: string;
  application: string;
  differences: FlagDifference[];
  coverFields: TemplateField[];
}

interface LegacyMeta {
  code: string; title: string; group: string; icon: string; color: string; roles: ActorCapacity[]; sensor?: SensorType;
}

/** Metadata for the eight original Meridian books whose templates carry only sections. */
const LEGACY_META: Record<string, LegacyMeta> = {
  deck: { code: 'DL', title: 'Deck & bridge', group: 'Navigation', icon: 'compass', color: 'blue', roles: ['officer'], sensor: 'navigation' },
  engine: { code: 'EL', title: 'Engine room', group: 'Engineering', icon: 'engine', color: 'orange', roles: ['engineer'], sensor: 'machinery' },
  garbage: { code: 'GR', title: 'Garbage record · Part I', group: 'Environment', icon: 'leaf', color: 'green', roles: ['officer', 'engineer'] },
  official: { code: 'OL', title: 'Official logbook', group: 'Statutory', icon: 'book', color: 'purple', roles: ['officer'] },
  gmdss: { code: 'RL', title: 'GMDSS radio', group: 'Navigation', icon: 'radio', color: 'blue', roles: ['officer'] },
  oil: { code: 'OR', title: 'Oil record · Part I', group: 'Environment', icon: 'drop', color: 'green', roles: ['engineer'] },
  ihm: { code: 'HM', title: 'IHM maintenance', group: 'Environment', icon: 'layers', color: 'orange', roles: ['engineer'] },
  orders: { code: 'SO', title: 'Standing & night orders', group: 'Operations', icon: 'moon', color: 'purple', roles: ['master', 'engineer'] },
};

const ICONS: Record<string, LucideIcon> = {
  compass: Compass, engine: Cog, leaf: Leaf, book: BookOpen, radio: Radio, drop: Droplets, layers: Layers, moon: Moon,
  bell: Bell, users: Users, waves: Waves, fuel: Fuel, gauge: Gauge, bug: Bug, shower: ShowerHead, anchor: Anchor,
};

const DB_TYPES: Record<string, string> = {
  official: 'official_log', deck: 'deck_log', engine: 'engine_log', garbage: 'garbage_record_book', gmdss: 'radio_log',
  oil: 'oil_record_book', ihm: 'ihm_record', orders: 'orders_book', garbage2: 'garbage_record_book_2', oil2: 'oil_record_book_2',
  cargo: 'cargo_record_book', ballast: 'ballast_water_record', ods: 'ods_record', fuel: 'fuel_record', nox: 'nox_record',
  sewage: 'sewage_record', biofouling: 'biofouling_record', bell: 'bell_book', visitor: 'visitor_log',
};

const SLUGS: Record<string, string> = {
  official: 'official-log', deck: 'deck-log', engine: 'engine-log', garbage: 'garbage-record-book', gmdss: 'radio-log',
  oil: 'oil-record-book', ihm: 'ihm-record', orders: 'orders', garbage2: 'garbage-record-book-part-2', oil2: 'oil-record-book-part-2',
  cargo: 'nls-cargo-record', ballast: 'ballast-water-record', ods: 'ods-record', fuel: 'fuel-changeover', nox: 'nox-record',
  sewage: 'sewage-record', biofouling: 'biofouling', bell: 'bell-book', visitor: 'visitor-log',
};

const ICON_OVERRIDES: Record<string, string> = { fuel: 'fuel', nox: 'gauge', biofouling: 'bug', sewage: 'shower', ballast: 'waves' };

/** Books that are statutory records for a typical commercial yacht. Operational books are still controlled records. */
const OPERATIONAL = new Set(['deck', 'engine', 'orders', 'sewage', 'biofouling', 'bell', 'visitor', 'nox', 'fuel', 'ods']);

const field = (key: string, label: string, type: TemplateField['type'] = 'text', extra: Partial<TemplateField> = {}): TemplateField =>
  ({ key, label, type, required: true, ...extra });
const optional = (f: TemplateField): TemplateField => ({ ...f, required: false });

/** Operational books carried over from the original module, expressed as single-section templates. */
const OPERATIONAL_BOOKS: DetailedBook[] = [
  {
    id: 'bell', code: 'BB', title: 'Bell book', group: 'Navigation', icon: 'bell', color: 'blue', roles: ['officer', 'engineer'],
    source: 'cisr', basis: 'Company format', application: 'Manoeuvring record during pilotage, berthing and restricted waters',
    sections: [{
      id: 'orders', title: 'Engine & helm orders', referencePages: 'Company format', signing: 'officer', coverage: 'Operational record',
      help: 'Record each engine and helm order with the time it was given and executed. Times are UTC.',
      fields: [
        field('order', 'Engine order', 'select', { options: ['Stop', 'Dead slow ahead', 'Slow ahead', 'Half ahead', 'Full ahead', 'Dead slow astern', 'Slow astern', 'Half astern', 'Full astern', 'Stand by engines', 'Finished with engines'] }),
        optional(field('rudder', 'Helm order')), field('givenBy', 'Order given by'), field('executedBy', 'Executed by'),
        optional(field('location', 'Location / stage')),
      ],
    }],
  },
  {
    id: 'visitor', code: 'VG', title: 'Visitor & guest log', group: 'Security', icon: 'users', color: 'purple', roles: ['officer', 'engineer', 'steward'],
    source: 'cisr', basis: 'Company format', application: 'ISPS record of visitors, contractors and guests boarding the vessel',
    sections: [{
      id: 'visits', title: 'Persons boarding', referencePages: 'Ship security plan', signing: 'officer', coverage: 'Operational record',
      fields: [
        field('visitorName', 'Visitor name'), optional(field('company', 'Company / affiliation')),
        field('visitorType', 'Visitor type', 'select', { options: ['Guest', 'Contractor', 'Surveyor', 'Official', 'Crew family', 'Delivery', 'Other'] }),
        field('idChecked', 'ID checked · type / number'), optional(field('timeAshore', 'Time ashore · UTC', 'datetime-local')),
        field('escortedBy', 'Escorted by'), optional(field('remarks', 'Remarks', 'textarea')),
      ],
    }],
  },
];

const build = (definition: DetailedBook): LogbookBook => {
  const legacy = LEGACY_META[definition.id];
  const title = definition.title ?? legacy?.title ?? definition.id;
  const iconKey = ICON_OVERRIDES[definition.id] ?? definition.icon ?? legacy?.icon ?? 'book';
  return {
    id: definition.id,
    slug: SLUGS[definition.id] ?? definition.id,
    dbType: DB_TYPES[definition.id] ?? definition.id,
    code: definition.code ?? legacy?.code ?? definition.id.toUpperCase(),
    title,
    group: definition.group ?? legacy?.group ?? 'Records',
    icon: ICONS[iconKey] ?? BookOpen,
    color: definition.color ?? legacy?.color ?? 'blue',
    description: definition.sections.slice(0, 3).map((section) => section.title).join(' · '),
    statutory: !OPERATIONAL.has(definition.id),
    roles: definition.roles ?? legacy?.roles ?? ['officer'],
    sensor: legacy?.sensor,
    sections: definition.sections,
    source: definition.source,
    basis: definition.basis,
    application: definition.application,
    differences: differences(definition),
    coverFields: volumeFieldsFor(definition.id),
  };
};

export const LOGBOOK_BOOKS: LogbookBook[] = [...detailedBooks, ...OPERATIONAL_BOOKS].map(build);

export const getBook = (id?: string | null): LogbookBook | undefined => LOGBOOK_BOOKS.find((book) => book.id === id);
export const getBookBySlug = (slug?: string | null): LogbookBook | undefined => LOGBOOK_BOOKS.find((book) => book.slug === slug);
export const getBookByDbType = (dbType?: string | null): LogbookBook | undefined => LOGBOOK_BOOKS.find((book) => book.dbType === dbType);
export const getSection = (book: LogbookBook | undefined, sectionId?: string | null): TemplateSection | undefined =>
  book?.sections.find((section) => section.id === sectionId);
export const referenceFor = (book: LogbookBook) => references[book.source];

export const DEPARTMENTS: Record<string, string> = {
  deck: 'Navigation', engine: 'Engineering', official: 'Ship administration', gmdss: 'Communications',
  orders: 'Vessel operations', ihm: 'Environmental management', bell: 'Navigation', visitor: 'Ship security',
};
export const departmentFor = (book: LogbookBook) => DEPARTMENTS[book.id] ?? (book.group === 'Environment' ? 'Environmental records' : book.group);

export const CATALOG_TOTALS = {
  books: LOGBOOK_BOOKS.length,
  sections: LOGBOOK_BOOKS.reduce((n, book) => n + book.sections.length, 0),
  fields: LOGBOOK_BOOKS.reduce((n, book) => n + book.sections.reduce((m, section) => m + section.fields.length, 0), 0),
};

export interface ApprovalRoute { book: string; flag: string; route: string; reference: string; url: string; gap: string; }

export const APPROVAL_ROUTES: ApprovalRoute[] = [
  { book: 'Official logbook', flag: 'Cayman Islands', route: 'RO system assessment + onboard installation verification', reference: 'CIGN 08/2023 Rev 01', url: 'https://www.cishipping.com/acceptance-electronic-official-log-books', gap: 'Full form coverage, advanced signatures, 10-year retention and installation evidence.' },
  { book: 'MARPOL record books', flag: 'Cayman Islands', route: 'Authorised Recognized Organization', reference: 'CIGN 05/2019 Rev 2', url: 'https://www.cishipping.com/system/files/notices/documents/CIGN%2005%20-%202019%20-%20MARPOL%20Record%20Books%20Rev%202.pdf', gap: 'Per-book formats, signature implementation, retention and acceptance evidence.' },
  { book: 'MARPOL record books', flag: 'United Kingdom', route: 'UK RO approval + vessel declaration', reference: 'MIN 644', url: 'https://www.gov.uk/government/publications/min-644-mf-approval-and-acceptance-of-electronic-record-books-and-recording-requirements-under-marpol', gap: 'Approved system assessment and a valid declaration for each vessel.' },
  { book: 'Deck / navigation', flag: 'United Kingdom', route: 'UK Approved Body assessment', reference: 'MGN 690', url: 'https://www.gov.uk/government/publications/mgn-690-mf-approval-and-acceptance-of-electronic-record-books-and-recording-requirements-under-solas-chapter-vreg-28', gap: 'Applicable performance standards, conformity certificate and declaration.' },
  { book: 'Official + GMDSS', flag: 'United Kingdom', route: 'Confirm separate acceptance routes with MCA', reference: 'MGN 690 exclusions / MGN 530', url: 'https://www.gov.uk/government/publications/mgn-530-radio-log-book-merchant-shipping-and-fishing-vessels', gap: 'Electronic acceptance and exact forms remain unresolved for this product.' },
  { book: 'Engine, deck, GMDSS, IHM, orders', flag: 'Cayman / UK, as applicable', route: 'Book-specific flag, class and vessel applicability review', reference: 'Pilot scope to be agreed', url: 'https://www.cishipping.com/policy-advice/guidance-notes', gap: 'Determine mandatory records, operational records and evidence workflows individually.' },
];

/** Statement attached to every electronic attestation recorded by this module. */
export const ATTESTATION_STATEMENT =
  'Reviewed and attested in the logbook workspace. Not an advanced electronic signature; no flag, MCA or class approval is held.';
