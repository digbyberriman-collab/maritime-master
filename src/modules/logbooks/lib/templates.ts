/**
 * Meridian logbook templates — ported from the Meridian electronic-logbook handover.
 *
 * 17 book types, 103 sections / operations and 604 section fields, plus flag
 * profiles, source references and volume cover fields. These are original
 * data-entry designs mapped to the cited sources; they are not certified
 * facsimiles of any publisher's printed book and confer no flag or class
 * approval. Template changes apply to newly opened volumes only: every
 * opened volume stores its own snapshot of the sections it was opened with.
 */

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'datetime-local';

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  min?: number;
  max?: number;
  options?: string[];
  /** Conditionally required when another field equals a value. */
  requiredWhen?: { field: string; equals: string };
  /** Telemetry key that can populate this field from a captured sample. */
  telemetry?: string;
  /** Numbered item code (e.g. C.11) for oil / cargo / ballast books. */
  item?: string;
}

export type SigningPolicy =
  | 'officer-master' | 'master' | 'master-crew' | 'master-officer' | 'inspector-crew'
  | 'master-catering' | 'master-mother' | 'surveyor-master' | 'port-master' | 'officer';

/** Demo-era author capacities used by section role lists. Mapped to app roles in roles.ts. */
export type ActorCapacity = 'master' | 'officer' | 'engineer' | 'steward' | 'mother' | 'surveyor' | 'portofficial';

export interface TemplateSection {
  id: string;
  title: string;
  fields: TemplateField[];
  referencePages: string;
  signing: SigningPolicy;
  coverage: string;
  roles?: ActorCapacity[];
  help?: string;
  operationCode?: string;
  acknowledgement?: boolean;
  itemGroup?: string;
}

export type SourceKey = 'cisr' | 'official' | 'garbage' | 'oil' | 'oil2' | 'cargo' | 'ballast' | 'radio' | 'ihm' | 'annexVI' | 'bio';

export interface SourceReference { title: string; url: string; note: string; }

export interface FlagProfile { id: 'CISR' | 'MCA'; title: string; flag: string; officialLayout: string; }

export interface FlagDifference { topic: string; cisr: string; mca: string; shared: boolean; }

export interface DetailedBook {
  id: string;
  sections: TemplateSection[];
  source: SourceKey;
  basis: string;
  application: string;
  title?: string;
  code?: string;
  group?: string;
  icon?: string;
  color?: string;
  roles?: ActorCapacity[];
  description?: string;
}

type Spec = [string, string] | [string, string, FieldType];

export const templateRevision = 'workbooks-0.2.1';
export const references: Record<SourceKey, SourceReference> = {
  cisr: { title: 'CISR CIGN 05/2020 Rev 1 · log and record books', url: 'https://www.cishipping.com/system/files/notices/documents/CIGN%202020-05%20Log%20and%20Record%20Books.pdf?download=1', note: 'Printed-book acceptance and operational formats. Historical applicability thresholds need current rules.' },
  official: { title: 'MCA yacht master’s guide · official book page index', url: 'https://www.gov.uk/government/publications/the-yacht-masters-guide-to-the-uk-flag/a-masters-guide-to-the-uk-flag-large-yacht-edition', note: '2022 guide. Full current printed books and statutory schedule reconciliation still required.' },
  garbage: { title: 'IMO MEPC.277(70) · Garbage Record Book I and II', url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.277(70).pdf', note: 'Operation columns and categories mapped; publisher pagination not reproduced.' },
  oil: { title: 'CISR CIGN 05/2010 · oil book item corrections', url: 'https://www.cishipping.com/system/files/notices/documents/2010_05_CIGN.pdf', note: 'Historical item mapping, including corrected C.11/C.12 and Part II J. Requires reconciliation with current book and circular revisions.' },
  oil2: { title: 'IMO MEPC.117(52) · Oil Record Book II A–R', url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.117(52).pdf', note: 'Historical 2004 Annex I format with A–R item mapping and CISR J corrections. Current consolidated edition and subsequent amendments still need reconciliation.' },
  cargo: { title: 'MARPOL consolidated text · historical item index', url: 'https://static.slov-lex.sk/pdf/prilohy/SK/ZZ/2025/230/20250903_5752349-2.pdf', note: 'Content is the 2011 edition despite the 2025 hosting path. Historical baseline only; current edition verification outstanding.' },
  ballast: { title: 'IMO MEPC.369(80) · revised ballast record format', url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.369(80).pdf', note: 'Format effective 1 February 2025. A–H operation mapping; electronic acceptance is a separate assessment.' },
  radio: { title: 'MCA MGN 530 · radio records', url: 'https://www.gov.uk/government/publications/mgn-530-radio-log-book-merchant-shipping-and-fishing-vessels', note: 'Requirement mapping plus original equipment checklist. Current printed CISR/MCA radio editions still needed.' },
  ihm: { title: 'IMO MEPC.379(80) · IHM development guidelines', url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.379(80).pdf', note: 'IHM and maintenance workflow, not a flag-prescribed daily logbook. Reconcile MEPC.405(83) amendments before release.' },
  annexVI: { title: 'MCA MIN 644 · electronic MARPOL records', url: 'https://www.gov.uk/government/publications/min-644-mf-approval-and-acceptance-of-electronic-record-books-and-recording-requirements-under-marpol', note: 'Identifies book categories and acceptance route; proposed fields need current Annex VI and engine technical-file review.' },
  bio: { title: 'IMO MEPC.378(80) · biofouling guidelines', url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MEPCDocuments/MEPC.378(80).pdf', note: 'Workflow placeholder; detailed guideline-to-field reconciliation outstanding.' },
};
export const profiles: FlagProfile[] = [
  { id: 'CISR', title: 'CISR · Cayman Islands', flag: 'Cayman Islands', officialLayout: 'MCA-style printed OLB accepted by CISR; CISR publisher edition pending' },
  { id: 'MCA', title: 'MCA · United Kingdom', flag: 'United Kingdom', officialLayout: 'MCA guide page index; current printed edition pending' },
];
const f = (key: string, label: string, type: FieldType = 'text', extra: Partial<TemplateField> = {}): TemplateField => ({ key, label, type, required: true, ...extra });
const n = (key: string, label: string, extra: Partial<TemplateField> = {}): TemplateField => f(key, label, 'number', { min: 0, max: 100000000, ...extra });
const t = (key: string, label: string, extra: Partial<TemplateField> = {}): TemplateField => f(key, label, 'textarea', extra);
const opt = (field: TemplateField): TemplateField => ({ ...field, required: false });
const choice = (key: string, label: string, options: string[], extra: Partial<TemplateField> = {}): TemplateField => f(key, label, 'select', { options, ...extra });
const yn = (key: string, label: string): TemplateField => choice(key, label, ['Yes', 'No', 'Not applicable — explain in remarks']);
const dt = (key: string, label: string): TemplateField => f(key, label, 'datetime-local');
const pos = (): TemplateField[] => [n('latitude', 'Latitude °', { min: -90, max: 90, telemetry: 'latitude' }), n('longitude', 'Longitude °', { min: -180, max: 180, telemetry: 'longitude' })];
const interval = (): TemplateField[] => [dt('startTime', 'Start · UTC'), f('startPlace', 'Start · port or position'), dt('endTime', 'Finish · UTC'), f('endPlace', 'Finish · port or position')];
const tank = (): TemplateField => f('tanks', 'Tank IDs / compartments');
const qty = (): TemplateField => n('quantity', 'Quantity · m³');
const evidence = (): TemplateField => opt(f('evidenceRef', 'Evidence / receipt / annex reference'));
const s = (id: string, title: string, fields: TemplateField[], extra: Partial<TemplateSection> = {}): TemplateSection => ({ id, title, fields, referencePages: 'Operation record', signing: 'officer-master', coverage: 'Mapped workflow', ...extra });
const op = (id: string, title: string, specs: Spec[], extra: Partial<TemplateSection> = {}): TemplateSection => s(id, title, specs.map(([code, label, type = 'text']) => f('item' + code.replace(/\./g, '_'), label, type, { item: code, ...(type === 'number' ? { min: 0, max: 100000000 } : {}) })), { operationCode: id, ...extra });
const garbageCats = ['A · Plastics', 'B · Food', 'C · Domestic', 'D · Cooking oil', 'E · Incinerator ash', 'F · Operational waste', 'G · Animal carcasses', 'H · Fishing gear', 'I · E-waste'];
const garbageSections = (part2: boolean): TemplateSection[] => {
  const category = () => choice('category', 'Category', part2 ? ['J · Non-HME cargo residues', 'K · HME cargo residues'] : garbageCats);
  return [
    s('reception', 'Land ashore / transfer to another ship', [category(), qty(), f('port', 'Port / position'), choice('destination', 'Destination', ['Reception facility', 'Another ship']), f('recipient', 'Facility or receiving ship'), evidence()]),
    s('sea', 'Discharge at sea', [category(), qty(), ...pos(), ...(part2 ? interval() : []), t('circumstances', 'Operation details and conditions')]),
    ...(!part2 ? [s('incineration', 'Incineration', [category(), qty(), ...interval(), opt(f('equipment', 'Incinerator ID'))])] : []),
    s('exception', 'Accidental loss / exceptional discharge', [category(), qty(), f('location', 'Location / port'), opt(n('depth', 'Water depth if known · m')), t('reason', 'Reason and circumstances'), t('precautions', 'Precautions and recovery action')]),
  ];
};
const official: TemplateSection[] = [
  s('particulars', 'Vessel particulars & opening', [f('shipName', 'Vessel name'), f('portRegistry', 'Registry port'), f('officialNumber', 'Official number · not IMO number'), n('grossTonnage', 'GT'), n('netTonnage', 'NT'), f('owner', 'Owner / manager'), t('ownerAddress', 'Address'), f('openingPlace', 'Opening place')], { referencePages: '1', roles: ['master'], signing: 'master' }),
  s('masters', 'Successive masters', [f('masterName', 'Master name'), f('certificate', 'Certificate number / grade'), f('issuer', 'Issuing authority'), evidence()], { referencePages: '1', roles: ['master'], signing: 'master' }),
  s('crew', 'Crew index', [n('crewReference', 'Crew-list reference', { min: 1 }), f('crewName', 'Seafarer name'), f('capacity', 'Capacity'), opt(f('narrativePages', 'Linked narrative pages / record IDs'))], { referencePages: '2–7', roles: ['master'], signing: 'master' }),
  s('birth', 'Birth record', [f('childName', 'Child name'), f('birthPlace', 'Place'), f('motherName', 'Mother name'), opt(f('fatherName', 'Father / parent details')), evidence()], { referencePages: '8–9', coverage: 'Edition needed', roles: ['master'], signing: 'master-mother', help: 'Provisional field set. Mother countersignature demonstrated with a fictional identity. Obtain printed page and flag return form.' }),
  s('death', 'Death record', [f('deceasedName', 'Deceased name'), f('capacity', 'Capacity / passenger'), f('deathPlace', 'Place'), t('circumstances', 'Circumstances and recorded cause'), evidence()], { referencePages: '8–9', coverage: 'Edition needed', roles: ['master'], signing: 'master-crew', help: 'Provisional field set. Current book page and flag death-return form are required for complete mapping.' }),
  s('drills', 'Musters, drills & training', [choice('drill', 'Exercise', ['Fire', 'Abandon ship', 'Enclosed-space rescue', 'Rescue boat', 'Training', 'Postponed / cancelled', 'Other']), t('details', 'Exercise, equipment condition and boat lowering'), opt(t('reason', 'Postponement / defect action')), evidence()], { referencePages: '10–14', signing: 'master-crew' }),
  s('steering', 'Steering tests & drills', [f('location', 'Place / position'), choice('test', 'Test', ['Pre-departure', 'Emergency steering', 'Inspection', 'Other']), t('result', 'Modes tested, communication and findings')], { referencePages: '15–18', signing: 'master-officer' }),
  s('accommodation', 'Accommodation inspections', [f('inspectors', 'Inspectors and capacities'), t('areas', 'Areas inspected'), t('findings', 'Findings and corrective action')], { referencePages: '19–23', signing: 'inspector-crew' }),
  s('foodwater', 'Food & water inspections', [f('inspectors', 'Inspectors and capacities'), t('food', 'Provisions / catering findings'), t('water', 'Fresh-water findings'), opt(t('actions', 'Corrective action'))], { referencePages: '24–28', signing: 'master-catering' }),
  s('loadline', 'Load-line declaration', [f('certificate', 'Load-line certificate reference'), f('deckLine', 'Deck-line reference'), t('freeboards', 'Assigned freeboards and seasonal marks'), n('freshWaterAllowance', 'Fresh-water allowance · mm'), t('declaration', 'Master declaration / applicable limitations')], { referencePages: '29', roles: ['master'], signing: 'master', coverage: 'Edition needed' }),
  s('voyage', 'Departures, draughts & arrivals', [f('departurePort', 'Departure port'), n('draughtForward', 'Forward draught · m'), n('draughtAft', 'Aft draught · m'), n('freeboardPort', 'Port freeboard · m'), n('freeboardStarboard', 'Starboard freeboard · m'), opt(n('waterDensity', 'Water density · kg/m³')), opt(f('arrivalPort', 'Arrival port')), opt(dt('arrivalTime', 'Arrival · UTC'))], { referencePages: '30–39', signing: 'master-officer', coverage: 'Edition needed' }),
  s('narrative', 'Narrative & annexes', [choice('event', 'Event', ['Command handover', 'Crew joining / leaving', 'Accident / casualty', 'Illness', 'Discipline / complaint', 'Safety appointment / meeting', 'Working language', 'Wages dispute', 'Annexed document', 'Book closure', 'Other required entry']), f('location', 'Place / position'), opt(f('crewReferences', 'Crew-list references')), t('record', 'Event, action and required particulars'), evidence()], { referencePages: '40–76', signing: 'master-crew', help: 'Narrative categories are a working index; the full amended statutory entry schedule is not yet exhaustively mapped.' }),
];
const deck: TemplateSection[] = [
  s('watch', 'Watch record & handover', [...pos(), n('speed', 'SOG · kn', { max: 100, telemetry: 'speed' }), n('course', 'COG · °T', { max: 359.999, telemetry: 'course' }), opt(n('heading', 'Heading · °T', { max: 359.999 })), f('weather', 'Wind / visibility / sea'), f('watch', 'Watch period'), f('lookout', 'Lookout / helmsman'), t('navigation', 'Route, traffic, position checks and handover')]),
  s('noon', 'Noon report', [...pos(), n('distance', 'Distance since previous report · nm'), n('speed', 'SOG · kn', { max: 100, telemetry: 'speed' }), f('weather', 'Wind / sea / weather'), n('fuelRob', 'Fuel remaining · tonnes'), n('waterRob', 'Fresh water remaining · m³'), f('destination', 'Destination / ETA')]),
  s('movement', 'Arrival, departure & anchoring', [choice('movement', 'Movement', ['Departure', 'Arrival', 'Anchor down', 'Anchor aweigh', 'Berth shift']), f('port', 'Port / berth / anchorage'), ...pos(), opt(f('pilot', 'Pilot and boarding / leaving times')), opt(f('tugs', 'Tugs')), t('mooring', 'Mooring / anchor details and sequence'), opt(n('draughtForward', 'Forward draught · m')), opt(n('draughtAft', 'Aft draught · m'))]),
  s('navigation', 'Navigation event / equipment', [choice('event', 'Event', ['Course alteration', 'Restricted visibility', 'Equipment failure', 'Position discrepancy', 'Near miss', 'Other']), ...pos(), t('details', 'Observations and actions'), evidence()]),
  s('checks', 'Bridge pre-departure & watch checks', [f('checklist', 'SMS checklist revision'), f('navigation', 'Charts, passage plan and navigation equipment'), f('steering', 'Steering / propulsion / communications'), f('safety', 'Watertight condition / safety readiness'), t('exceptions', 'Results / exceptions / action')]),
];
const engine: TemplateSection[] = [
  s('round', 'Machinery rounds', [f('machinery', 'Machinery / running units'), n('generatorLoad', 'Generator 1 load · kW', { max: 5000, telemetry: 'generatorLoad' }), n('oilPressure', 'Main engine oil pressure · bar', { max: 30, telemetry: 'oilPressure' }), n('coolantTemp', 'Main engine coolant · °C', { min: -20, max: 150, telemetry: 'coolantTemp' }), n('runningHours', 'Generator 1 hours · h', { max: 1000000, telemetry: 'runningHours' }), opt(n('rpm', 'Engine speed · rpm')), opt(n('exhaust', 'Exhaust temperature · °C')), opt(n('fuelPressure', 'Fuel pressure · bar')), opt(n('seaPressure', 'Sea-water pressure · bar')), t('auxiliaries', 'Pumps, bilges, separators, HVAC and other readings')]),
  s('handover', 'Engineering watch handover', [f('watch', 'Watch period'), t('plant', 'Plant condition / operating configuration'), t('alarms', 'Alarms / inhibits / defects'), t('work', 'Work in progress / permits / isolation'), t('instructions', 'Handover instructions')]),
  s('transfer', 'Fuel / water / internal transfers', [f('fluid', 'Fluid / grade'), f('fromTank', 'Source tank'), f('toTank', 'Destination tank'), qty(), ...interval(), t('soundings', 'Before / after soundings and remaining quantities')]),
  s('maintenance', 'Maintenance, defects & I/O events', [f('asset', 'Asset / AMCS tag'), choice('event', 'Event', ['Maintenance', 'Defect', 'Alarm', 'Changeover', 'Isolation', 'Test']), t('condition', 'Observed condition / alarm'), t('action', 'Work / action taken'), f('status', 'Result / follow-up'), evidence()]),
  s('consumption', 'Daily consumption & tank readings', [t('fuel', 'Fuel tanks: opening, received, transferred, consumed, closing · tonnes'), t('water', 'Water tanks and consumption · m³'), t('lubricants', 'Lubricants and consumption · litres'), t('hours', 'Machinery running-hour counters'), evidence()]),
];
const oil: TemplateSection[] = [
  op('A', 'Fuel-tank cleaning / ballasting', [['1','Tank IDs'],['2','Tanks cleaned since oil / previous oil'],['3_1','Cleaning time and positions'],['3_2','Method / chemicals / quantity'],['3_3','Wash-water destination and volume'],['4_1','Ballasting time and positions'],['4_2','Ballast volume if uncleaned']]),
  op('B', 'Dirty ballast / cleaning-water disposal', [['5','Tank IDs'],['6','Start position'],['7','Finish position'],['8','Speeds'],['9','15-ppm equipment or reception facility'],['10','Discharged m³','number']]),
  op('C11', 'Sludge inventory / collection', [['11.1','Tank ID'],['11.2','Capacity · m³','number'],['11.3','Retained · m³','number'],['11.4','Manually collected · m³','number']], { operationCode: 'C' }),
  op('C12', 'Sludge transfer / disposal', [['12','Disposed / transferred m³, source tank and retained amount'],['12.1','Reception facility / port, or N/A'],['12.2','Destination tank / retained m³, or N/A'],['12.3','Incineration hours, or N/A'],['12.4','Other method, or N/A']], { operationCode: 'C' }),
  op('D', 'Manual bilge-water disposal', [['13','Disposed · m³','number'],['14','Start / stop UTC'],['15.1','15-ppm system / positions, or N/A'],['15.2','Reception facility / port, or N/A'],['15.3','Receiving tank / retained m³, or N/A']]),
  op('E', 'Automatic bilge-water disposal', [['16','Auto-overboard start UTC / position, or N/A'],['17','Auto-transfer start UTC / tank, or N/A'],['18','Return to manual UTC']]),
  op('F', 'Filtering equipment failure', [['19','Failure UTC'],['20','Restoration UTC / still out of service'],['21','Cause / circumstances']]),
  op('G', 'Accidental / exceptional oil discharge', [['22','Occurrence UTC'],['23','Place / position'],['24','Oil type / estimated m³'],['25','Circumstances and action']]),
  op('H', 'Fuel / bulk lubricating-oil bunkering', [['26.1','Bunkering place'],['26.2','Start / finish UTC'],['26.3','Fuel grade / tonnes added / tanks / totals, or N/A'],['26.4','Lubricant grade / tonnes added / tanks / totals, or N/A']]),
  s('I', 'Additional procedures / remarks', [t('record', 'Operational remarks'), evidence()], { operationCode: 'I' }),
];
const oil2: TemplateSection[] = [
  op('A', 'Oil-cargo loading', [['1','Loading port'],['2','Oil grade / tanks'],['3','Loaded m³ at 15°C / tank totals']]),
  op('B', 'Cargo transfer', [['4.1','From tanks'],['4.2','To tanks / transferred m³ / totals'],['5','Emptied / remaining m³']]),
  op('C', 'Oil-cargo unloading', [['6','Unloading port'],['7','Tank IDs'],['8','Emptied / remaining m³']]),
  op('D', 'Crude-oil washing', [['9','Place / position'],['10','Tank / section'],['11','Machine count'],['12','Start UTC'],['13','Washing pattern'],['14','Line pressure'],['15','Finish UTC'],['16','Dryness verification'],['17','Deviations / remarks']]),
  op('E', 'Cargo-tank ballasting', [['18','Start / end positions'],['19.1','Tanks'],['19.2','Start / end UTC'],['19.3','Received m³ / tank totals']]),
  op('F', 'Dedicated clean ballast', [['20','Tanks'],['21','Flushing-water uptake position'],['22','Flushing position'],['23','Slop tanks / transferred m³'],['24','Additional uptake position'],['25','Isolation UTC / position'],['26','Clean ballast · m³','number']]),
  op('G', 'Cargo-tank cleaning', [['27','Tanks'],['28','Place / position'],['29','Duration'],['30','Method / agents / quantities'],['31.1','Reception port / m³, or N/A'],['31.2','Slop tanks / transfer m³ / totals, or N/A']]),
  op('H', 'Dirty-ballast discharge', [['32','Tanks'],['33','Start UTC / position'],['34','End UTC / position'],['35','Sea discharge · m³','number'],['36','Speeds'],['37','ODME operating?'],['38','Effluent / sea observed?'],['39','Slop transfer / m³'],['40','Reception port / m³']]),
  op('I', 'Slop-water discharge', [['41','Slop tanks'],['42','Settling since receipt'],['43','Settling since discharge'],['44','Start UTC / position'],['45','Initial total ullage · m'],['46','Initial interface ullage · m'],['47','Bulk m³ / m³ per hour'],['48','Final m³ / m³ per hour'],['49','End UTC / position'],['50','ODME operating?'],['51','Final interface ullage · m'],['52','Speeds'],['53','Effluent / sea observed?'],['54','Valves closed?']]),
  op('J', 'Residues / oily mixtures disposal', [['55','Tanks'],['56','Transfer m³ / retained m³'],['57.1','Reception port / m³, or N/A'],['57.2','Mixed cargo / m³, or N/A'],['57.3','Other tank / m³ / totals, or N/A'],['57.4','Other method / m³, or N/A']]),
  op('K','Clean-ballast discharge',[['58','Initial position'],['59','Tanks'],['60','Empty at finish?'],['61','Final position / unchanged'],['62','Effluent and sea monitored?']]),
  op('L','Dedicated clean-ballast discharge',[['63','Tanks'],['64','Start UTC / position'],['65','End UTC / position'],['66.1','To sea · m³ / N/A'],['66.2','To facility · m³ / port / N/A'],['67','Oil contamination observed?'],['68','Oil-content meter used?'],['69','Isolation UTC / position']]),
  op('M','Discharge-monitoring failure',[['70','Failure UTC'],['71','Restored UTC / still out of service'],['72','Cause']]),
  op('N','Accidental / exceptional discharge',[['73','Occurrence UTC'],['74','Port / position'],['75','Estimated m³ / oil grade'],['76','Circumstances / cause / action']]),
  s('O','Additional remarks',[t('record','Operational remarks'),evidence()],{operationCode:'O'}),
  op('P','Specific trades · ballast loading',[['77','Tanks'],['78','Position'],['79','Loaded · m³','number'],['80','Remarks']]),
  op('Q','Specific trades · ballast reallocation',[['81','Reallocation reason']]),
  op('R','Specific trades · ballast landed',[['82','Discharge port'],['83','Receiving facility'],['84','Discharged · m³','number'],['85','Port-official date / stamp reference']],{signing:'port-master',help:'Port official’s countersignature is a fictional demonstration. An actual authority endorsement and stamp are not issued by this app.'}),
];
const cargo: TemplateSection[] = [
  op('A','NLS cargo loading',[['1','Loading place'],['2','Tanks / substances / categories']]),
  op('B','Internal cargo transfer',[['3','Substances / categories'],['4.1','From tanks'],['4.2','To tanks'],['5','Emptied?'],['6','Remaining quantities']]),
  op('C','Cargo unloading',[['7','Place'],['8','Tanks'],['9','Emptied / remaining / P&A stripping conditions'],['10','Prewash required?'],['11','Pump or stripping failure / cause / restoration']]),
  op('D','Mandatory prewash',[['12','Tanks / substances / categories'],['13','Machines / duration / cycles / temperature'],['14','Receiving facility / port']]),
  op('E','Other cleaning / ventilation',[['15','UTC / tanks / substances / categories / procedure / agents / fan count / duration'],['16','Wash-water destination / port / tank']]),
  op('F','Wash-water discharge at sea',[['17','Tanks / quantity / discharge rate / during cleaning?'],['18','Pump start / stop UTC'],['19','Ship speed']]),
  op('G','Cargo-tank ballasting',[['20','Tanks'],['21','Start UTC']]),
  op('H','Cargo-tank ballast discharge',[['22','Tanks'],['23','Sea / reception port'],['24','Start / stop UTC'],['25','Ship speed']]),
  op('I','Accidental / exceptional discharge',[['26','UTC'],['27','Estimated quantity / substance / category'],['28','Circumstances and action']]),
  op('J','Authorized surveyor record',[['29','Port'],['30','Tanks / substances / categories landed'],['31','Tanks / pumps / lines empty?'],['32','P&A prewash completed?'],['33','Washings landed / tanks empty?'],['34','Prewash exemption?'],['35','Exemption basis'],['36','Surveyor name'],['37','Surveyor organization']],{signing:'surveyor-master'}),
  s('K','Additional procedures / remarks',[t('record','Operational remarks'),evidence()],{operationCode:'K'}),
];
const ballast: TemplateSection[] = [
  ...[['A','Ballast uptake'],['B','Ballast discharge']].map(([id,title]) => s(id,title,[...interval(),n('depth','Minimum depth · m'),tank(),qty(),n('retained','Final retained · m³'),yn('plan','In accordance with BWMP?'),f('treatment','Treatment method')],{operationCode:id})),
  s('C1','Ballast exchange',[...interval(),n('landDistance','Minimum land distance · nm'),n('depth','Minimum depth · m'),opt(f('exchangeArea','Designated exchange area')),yn('plan','BWMP followed?'),choice('method','Exchange method',['Sequential','Flow-through','Dilution']),tank(),qty(),n('retained','Final onboard · m³'),f('treatment','Incoming-water treatment')],{operationCode:'C',itemGroup:'1'}),
  s('C2','Internal circulation / in-tank treatment',[dt('startTime','Start · UTC'),dt('endTime','Finish · UTC'),tank(),qty(),f('treatment','Treatment method')],{operationCode:'C',itemGroup:'2'}),
  s('D','Port / reception facility',[...interval(),choice('operation','Operation',['Uptake','Discharge']),tank(),qty(),n('retained','Final retained · m³'),yn('plan','BWMP followed?'),f('treatment','Onboard treatment')],{operationCode:'D'}),
  s('E','Accidental / exceptional operation',[...interval(),choice('operation','Operation',['Ingress','Uptake','Discharge','Loss']),tank(),qty(),t('circumstances','Circumstances, reason and treatment')],{operationCode:'E'}),
  s('F','BWMS failure / inoperability',[f('location','Failure location'),choice('operation','Operation',['Uptake','Discharge']),t('failure','Alarm / failure and circumstances'),opt(dt('restoredTime','Restored · UTC')),opt(f('restoredPlace','Restoration location')),t('action','Current status / action')],{operationCode:'F'}),
  s('G','Tank cleaning / sediment disposal',[...interval(),tank(),choice('destination','Destination',['Reception facility','Aquatic environment','No disposal']),opt(f('facility','Receiving facility')),qty(),opt(n('landDistance','Minimum land distance · nm')),opt(n('depth','Minimum depth · m')),t('method','Procedure / BWMP reference')],{operationCode:'G'}),
  s('H','Additional procedures / remarks',[t('record','Operational remarks'),evidence()],{operationCode:'H'}),
];
const radio: TemplateSection[] = [
  s('particulars','Radio installation particulars',[f('callSign','Call sign'),f('mmsi','MMSI'),f('seaArea','Operating sea area'),t('equipment','Installed radios / satellite terminals / serial numbers'),f('maintenance','Maintenance arrangements'),evidence()],{referencePages:'Particulars · edition pending',roles:['master']}),
  s('operators','Radio operator register',[f('operator','Operator'),f('certificate','GOC / ROC certificate'),f('issuer','Issuer'),f('responsibility','Radio responsibility / watch')],{referencePages:'Operator index · edition pending'}),
  s('traffic','Radio traffic / incidents',[choice('priority','Priority',['Distress','Urgency','Safety','Routine / other']),f('from','From station'),f('to','To station'),f('channel','Frequency / channel / satellite'),t('traffic','Message / incident / action'),opt(f('operator','Operator / watch')), ...pos()]),
  s('daily','Daily radio checks',[f('dsc','DSC self-test without transmission'),f('batteries','Radio battery state / charging'),f('printer','Printer / paper status'),opt(f('positionUpdate','Position input / NAVTEX / MSI checks')),t('action','Findings and follow-up')]),
  s('weekly','Weekly radio checks',[f('testCall','DSC coast-station test / reason deferred'),f('reserve','Non-battery reserve supply test / N/A'),t('action','Results / follow-up')]),
  s('monthly','Monthly radio checks',[f('epirb','EPIRB built-in test'),f('sart','SART check / security / condition'),f('batteries','Battery condition / terminals / compartment'),f('aerials','Aerial / insulator condition'),f('portable','Survival-craft VHF test'),t('action','Results / follow-up')]),
  s('position','Daily position / watch record',[...pos(),f('operator','Responsible operator'),t('record','Watch / radio availability / incidents')]),
];
const ihm: TemplateSection[] = [
  ...[['I1','I.1 · Coatings'],['I2','I.2 · Equipment & machinery'],['I3','I.3 · Structure & hull'],['II','II · Operational waste at recycling'],['III','III · Stores at recycling']].map(([id,title]) => s(id,title,[f('inventoryId','Inventory item ID'),f('item','Item / material'),f('location','Location'),f('hazard','Hazardous material'),n('quantity','Estimated amount'),f('unit','Unit'),choice('finding','Finding',['Confirmed present','Potentially present','Evidence pending']),opt(f('materialDeclaration','Material declaration')),opt(f('supplierDeclaration','Supplier declaration')),t('basis','Evidence and assessment basis')],{coverage:'Proposed inventory layout'})),
  s('change','Installation / removal / evidence change',[f('inventoryId','Inventory item ID'),choice('change','Change',['Installed','Removed','Replaced','Evidence updated']),f('item','Equipment / material'),f('location','Location'),f('supplier','Supplier / purchase order'),f('materialDeclaration','MD reference or missing-evidence action'),f('supplierDeclaration','SDoC reference or missing-evidence action'),t('assessment','Assessment / quantity change / revision impact')]),
];
const orders: TemplateSection[] = [
  s('standing','Master’s standing orders',[f('revision','Order revision'),t('navigation','Navigation / watchkeeping instructions'),t('callMaster','When to call the Master'),t('safety','Safety / weather / machinery instructions'),t('instructions','Other instructions'),evidence()],{roles:['master'],signing:'master',acknowledgement:true}),
  s('night','Master’s night orders',[f('watch','Applicable watch'),dt('validFrom','Valid from · UTC'),dt('validTo','Valid until · UTC'),f('route','Route / destination / expected traffic'),t('callMaster','Call-Master criteria'),t('instructions','Watch instructions')],{roles:['master'],signing:'master',acknowledgement:true}),
  s('engineOrders','Chief engineer’s orders',[f('watch','Applicable watch / revision'),t('plant','Plant operating instructions'),t('callEngineer','Call-chief-engineer criteria'),t('instructions','Work / isolations / standing instructions')],{roles:['engineer','master'],signing:'officer-master',acknowledgement:true}),
];
const extra = (id: string, code: string, title: string, group: string, icon: string, roles: ActorCapacity[], sections: TemplateSection[], source: SourceKey, basis: string, application = 'Confirm vessel applicability'): DetailedBook => ({ id,code,title,group,icon,roles,sections,source,basis,application,color:group==='Environment'?'green':'purple',description:sections.map(x=>x.title).slice(0,3).join(' · ') });
export const detailedBooks: DetailedBook[] = [
  {id:'official',sections:official,source:'official',basis:'Flag book · mapped guide',application:'Commercial-yacht default; vessel-specific statutory review required'},
  {id:'deck',sections:deck,source:'cisr',basis:'Company format',application:'Bridge operations; UK electronic navigation acceptance assessed separately'},
  {id:'engine',sections:engine,source:'cisr',basis:'Company format',application:'Tailor machinery rounds to the vessel and SMS'},
  {id:'garbage',title:'Garbage record · Part I',sections:garbageSections(false),source:'garbage',basis:'Shared IMO format',application:'Non-cargo garbage; applicability depends on current Annex V and vessel particulars'},
  {id:'gmdss',sections:radio,source:'radio',basis:'Requirement mapping',application:'Radio installation / voyage / tonnage dependent'},
  {id:'oil',title:'Oil record · Part I',sections:oil,source:'oil',basis:'Historical item mapping',application:'Machinery-space operations; applicability to be confirmed'},
  {id:'ihm',sections:ihm,source:'ihm',basis:'Inventory & maintenance',application:'Part I maintained in service; II / III prepared for recycling as applicable'},
  {id:'orders',sections:orders,roles:['master','engineer'],source:'cisr',basis:'Company format',application:'Master and engineering operational orders'},
  extra('garbage2','G2','Garbage record · Part II','Environment','leaf',['officer'],garbageSections(true),'garbage','Shared IMO format','Solid bulk cargo residues; usually outside a yacht’s operations'),
  extra('oil2','O2','Oil record · Part II','Environment','drop',['officer'],oil2,'oil2','Historical item mapping','Oil tanker cargo and ballast operations'),
  extra('cargo','CR','NLS cargo record','Environment','layers',['officer'],cargo,'cargo','Historical item mapping','Noxious liquid substances in bulk'),
  extra('ballast','BW','Ballast water record','Environment','drop',['officer','engineer'],ballast,'ballast','Shared IMO format','Vessel ballast system / exemptions / approved BWMP'),
  extra('ods','OD','Ozone-depleting substances','Environment','layers',['engineer'],[
    s('equipment','ODS equipment register',[f('equipment','Equipment ID'),f('location','Location'),f('substance','Refrigerant / ODS'),n('charge','Normal charge · kg'),evidence()]),
    s('operation','ODS use, servicing & disposal',[f('equipment','Equipment ID'),f('substance','Substance'),choice('operation','Operation',['Recharge','Repair / maintenance','Deliberate release','Accidental release','Disposal to reception facility','Supply to ship']),n('quantity','Quantity · kg'),f('recipient','Supplier / recipient / location'),t('action','Work / release circumstances / action'),evidence()]),
  ],'annexVI','Proposed regulatory workflow'),
  extra('fuel','FC','Fuel changeover & bunkering','Environment','drop',['engineer'],[
    s('changeover','ECA fuel changeover',[choice('operation','Operation',['Entering ECA · changeover completed','Leaving ECA · changeover started','Other operational change']),f('area','ECA / location'),...pos(),f('fuelFrom','Previous fuel / sulphur %'),f('fuelTo','New fuel / sulphur %'),t('tanks','Low-sulphur tank IDs / volumes · m³'),f('procedure','Changeover procedure / completion evidence')]),
    s('bunker','Bunker delivery & samples',[f('port','Port / supplier'),f('grade','Fuel grade'),n('quantity','Delivered · tonnes'),n('sulphur','Sulphur · %', {max:100}),f('bdn','BDN reference'),f('sample','Sample ID / seals / storage'),t('tanks','Receiving tanks / final quantities')]),
  ],'annexVI','Proposed regulatory workflow'),
  extra('nox','NX','NOx & engine parameters','Engineering','engine',['engineer'],[
    s('tier','Tier II / III status changes',[f('engine','Engine ID'),f('area','NOx ECA / area'),...pos(),choice('status','Status',['Tier III on','Tier III off','Entry into area','Exit from area']),f('method','SCR / EGR / other'),t('reason','Operating state / reason / exceptions')]),
    s('parameter','Engine parameter changes',[f('engine','Engine / serial number'),f('technicalFile','Approved technical-file reference'),f('component','Parameter / component'),f('old','Previous setting / part'),f('new','New setting / part'),f('approval','Allowed range / approval reference'),t('reason','Reason and checks')]),
  ],'annexVI','Proposed technical-file workflow'),
  extra('sewage','SW','Sewage & grey-water operations','Environment','drop',['engineer'],[
    s('plant','Treatment plant / tank round',[f('plant','Plant / tank IDs'),f('mode','Operating mode'),n('retained','Retained volume · m³'),t('checks','Treatment readings / alarms / maintenance')]),
    s('disposal','Discharge / landing',[choice('destination','Destination',['Reception facility','Sea']),...interval(),...pos(),qty(),f('treatment','Treatment status'),f('basis','Applicable operating conditions / procedure'),evidence()]),
  ],'cisr','Company format','Operational record; no claim of a universal CISR/MCA prescribed book'),
  extra('biofouling','BF','Biofouling management','Environment','leaf',['engineer','officer'],[
    s('inspection','Hull / niche-area inspection',[f('location','Inspection location'),f('areas','Hull / niche areas'),f('method','Inspection method / contractor'),t('findings','Findings / fouling extent'),evidence()]),
    s('cleaning','Cleaning / coating / treatment',[f('location','Location / facility'),f('areas','Areas treated'),f('contractor','Contractor'),t('method','Treatment / cleaning / coating details'),t('waste','Capture / waste handling'),evidence()]),
  ],'bio','Proposed guideline workflow'),
];
export const volumeFields: TemplateField[] = [f('label','Volume name / reference'),f('shipName','Vessel name'),f('officialNumber','Official / distinctive number'),opt(f('imoNumber','IMO number')),f('portRegistry','Port of registry'),n('grossTonnage','Gross tonnage'),opt(n('netTonnage','Net tonnage')),choice('vesselType','Vessel profile',['Commercial yacht','Private yacht','Passenger ship','Cargo ship','Oil tanker','Chemical tanker']),f('openingPlace','Opening place'),f('workingLanguage','Working language'),opt(f('certificateRef','Relevant certificate / plan reference')),opt(t('tankPlan','Tank plan / capacity reference')),opt(t('notes','Particulars / limitations'))];
export function volumeFieldsFor(bookId: string): TemplateField[] {
  if(bookId==='ballast') return [...volumeFields.map(f=>['certificateRef','tankPlan'].includes(f.key)?{...f,required:true}:f),n('ballastCapacity','Total ballast-water capacity · m³')];
  if(['oil2','cargo'].includes(bookId)) return [...volumeFields.map(f=>f.key==='tankPlan'?{...f,required:true}:f),t('tankCapacities','Tank IDs / capacities · m³'),...(bookId==='oil2'?[t('slopDepths','Slop-tank IDs / depths · m')]:[])];
  return volumeFields;
}
official.find(s=>s.id==='drills')!.fields.find(f=>f.key==='reason')!.requiredWhen={field:'drill',equals:'Postponed / cancelled'};
for(const key of ['facility','landDistance','depth']) ballast.find(s=>s.id==='G')!.fields.find(f=>f.key===key)!.requiredWhen={field:'destination',equals:key==='facility'?'Reception facility':'Aquatic environment'};
export function differences(book: DetailedBook): FlagDifference[] {
  const common = { topic:'Record structure', cisr:book.basis, mca:book.basis, shared:true };
  if(book.id==='official') return [
    {topic:'Printed layout',cisr:'CISR accepts the MCA printed OLB. The separate current CISR publisher edition has not been obtained.',mca:'MCA guide page groups 1–76 mapped. Exact current printed forms are still required.',shared:false},
    {topic:'Birth / death return',cisr:'Cayman Shipping Master · RB1 / RD1, as applicable.',mca:'UK Registry · MSF 4605 referenced by the guide.',shared:false},
    {topic:'Electronic acceptance',cisr:'CIGN 08/2023 Rev 01 · system and onboard installation assessment.',mca:'Separate MCA confirmation required; MGN 690 does not cover the OLB.',shared:false},
    {topic:'Coverage',cisr:'CISR profile uses the mapped MCA-style design; no claim of a CISR facsimile.',mca:'Births, deaths, load-line and voyage sheets need exact edition checks.',shared:false},
  ];
  if(['deck','engine','orders','sewage'].includes(book.id)) return [common,{topic:'Layout',cisr:'Operational company design. CISR does not prescribe deck / engine printed layouts.',mca:book.id==='deck'?'Operational design; electronic navigation route includes MGN 690.':'Agree the vessel SMS and book-specific requirements; no exact MCA printed layout claimed.',shared:false},{topic:'Configuration',cisr:'Vessel equipment, watch routine and SMS.',mca:'Vessel equipment, watch routine and SMS.',shared:true}];
  return [common,{topic:'Flag-specific fields',cisr:'No different operation columns established by the reviewed references.',mca:'Shared operation fields retained; flag and book edition stored on each volume.',shared:true},{topic:'Acceptance',cisr:'Cayman book-specific acceptance and onboard documentation.',mca:'UK book-specific approval / declaration; not conferred by this prototype.',shared:false},{topic:'Edition status',cisr:references[book.source].note,mca:references[book.source].note,shared:true}];
}
