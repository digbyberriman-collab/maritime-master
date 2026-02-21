// Real Fleet Seed Data for Maritime Master (STORM)
// Company: Inkfish | Flag State: Cayman Islands (CISR)

export const VESSELS = [
  { name: 'M/Y DRAAK', slug: 'draak', type: 'Motor Yacht', designation: 'Main Fleet', flag: 'Cayman Islands', approxCrew: 48, notes: 'Formerly Tranquility' },
  { name: 'M/Y GAME CHANGER', slug: 'game-changer', type: 'Motor Yacht', designation: 'Main Fleet', flag: 'Cayman Islands', approxCrew: 38, notes: '' },
  { name: 'M/Y LEVIATHAN', slug: 'leviathan', type: 'Motor Yacht', designation: 'Main Fleet', flag: 'Cayman Islands', approxCrew: 65, notes: 'Formerly Project 722, largest crew' },
  { name: 'M/Y ROCINANTE', slug: 'rocinante', type: 'Motor Yacht', designation: 'Main Fleet', flag: 'Cayman Islands', approxCrew: 57, notes: '' },
  { name: 'M/Y XIPHIAS', slug: 'xiphias', type: 'Motor Yacht', designation: 'Main Fleet', flag: 'Cayman Islands', approxCrew: 3, notes: 'Skeleton crew' },
  { name: 'R/V DAGON', slug: 'dagon', type: 'Research Vessel', designation: 'Research Fleet', flag: 'Cayman Islands', approxCrew: 0, notes: '' },
  { name: 'R/V HYDRA', slug: 'hydra', type: 'Research Vessel', designation: 'Research Fleet', flag: 'Cayman Islands', approxCrew: 0, notes: '' },
] as const;

export const DEPARTMENTS = ['Deck', 'Engineering', 'Interior', 'Galley', 'Dive', 'Tech', 'Purser', 'Medical', 'Wellness'] as const;
export type Department = typeof DEPARTMENTS[number];

export interface CrewMember {
  name: string;
  department: string;
  level: string;
  vessel: string;
  nationality?: string;
  email?: string;
}

export const CREW_DRAAK: CrewMember[] = [
  { name: 'Phillip Carter', department: 'Deck', level: 'Captain', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Digby Berriman', department: 'Deck', level: 'Captain', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Jack Sanguinetti', department: 'Deck', level: 'Chief Officer', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Juan Norman', department: 'Deck', level: 'Chief Officer', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Mitchell Coldicutt', department: 'Deck', level: 'Chief Officer', vessel: 'DRAAK', nationality: 'Australian' },
  { name: 'Oliver Kincart', department: 'Deck', level: 'First Officer', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Emile McPherson', department: 'Deck', level: 'First Officer', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Emil Schwarz', department: 'Deck', level: 'Bosun', vessel: 'DRAAK', nationality: 'German' },
  { name: 'Luke Petzer', department: 'Deck', level: 'Bosun', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Callum Brown', department: 'Engineering', level: 'Chief Engineer', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Stephen Heafield', department: 'Engineering', level: 'Chief Engineer', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Douglas Cullingworth', department: 'Engineering', level: 'Second Engineer', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Joshua Walters', department: 'Engineering', level: 'EGR 3', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Jake Thompson', department: 'Engineering', level: 'EGR 4', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Christopher Anthony McGowan', department: 'Engineering', level: 'EGR 5', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Mitchel Anthony Jardine', department: 'Engineering', level: 'EGR 5', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Richard Smyth', department: 'Engineering', level: 'EGR 8', vessel: 'DRAAK', nationality: 'Irish' },
  { name: 'Tom Morris', department: 'Engineering', level: 'EGR 8', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Nicole Annmarie Collen', department: 'Purser', level: 'PUR 2', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Oliver Ronald Kincart', department: 'Purser', level: 'PUR 1', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Charlotte Elizabeth Williams', department: 'Interior', level: 'INT 6', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Harriet Pascale Pugson', department: 'Interior', level: 'INT 6', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Ruby Ann Williams', department: 'Interior', level: 'INT 5.1', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Allabama Isabelle Wyke', department: 'Interior', level: 'INT 3.1', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Olivia Kristen Lanham', department: 'Interior', level: 'INT 2', vessel: 'DRAAK', nationality: 'American' },
  { name: 'Azraa Hayat', department: 'Galley', level: 'GAL 5.1', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Carola Villasana', department: 'Galley', level: 'GAL 6.2', vessel: 'DRAAK', nationality: 'Mexican' },
  { name: 'Alex Edward Sawyer', department: 'Galley', level: 'GAL 4', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Darrol John Patterson', department: 'Galley', level: 'GAL 4', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Shamus O\'Brien', department: 'Galley', level: 'GAL 3', vessel: 'DRAAK', nationality: 'Irish' },
  { name: 'Daniel Richard Lobjoit', department: 'Medical', level: 'MED 2', vessel: 'DRAAK', nationality: 'British' },
  { name: 'Jarod Martin Menger', department: 'Medical', level: 'MED 3', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Levinus Van Schalkwyk', department: 'Medical', level: 'MED 3.1', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Michaella Sylvia Lampe', department: 'Dive', level: 'DIV 3', vessel: 'DRAAK', nationality: 'South African' },
  { name: 'Dafydd Thomas', department: 'Dive', level: 'DIV 7', vessel: 'DRAAK', nationality: 'Welsh' },
];

export const CREW_LEVIATHAN: CrewMember[] = [
  { name: 'Jack Harry Green', department: 'Deck', level: 'DEC 1.2', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Oscar Niclas Arne Pettersson', department: 'Deck', level: 'DEC 1.2', vessel: 'LEVIATHAN', nationality: 'Swedish' },
  { name: 'Edward George Ogilvie Pollard', department: 'Deck', level: 'DEC 2', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Hayden Grant Swaving', department: 'Deck', level: 'DEC 3', vessel: 'LEVIATHAN', nationality: 'South African' },
  { name: 'Henry Meiklejohn Sclater', department: 'Deck', level: 'DEC 3', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Nicolas Dominique Mark Horsnail', department: 'Deck', level: 'DEC 3', vessel: 'LEVIATHAN', nationality: 'French' },
  { name: 'Sam Alexander Dawkins', department: 'Deck', level: 'DEC 3', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Brayden George Mazey', department: 'Deck', level: 'DEC 3.1', vessel: 'LEVIATHAN', nationality: 'Australian' },
  { name: 'Steeve Antoine Jonathan Armenante', department: 'Deck', level: 'DEC 7', vessel: 'LEVIATHAN', nationality: 'French' },
  { name: 'Stephen Bryce Quarrie', department: 'Deck', level: 'DEC 10', vessel: 'LEVIATHAN', nationality: 'New Zealander' },
  { name: 'Paddy Russell', department: 'Engineering', level: 'EGR 11', vessel: 'LEVIATHAN', nationality: 'Irish' },
  { name: 'Shane McLarnon', department: 'Engineering', level: 'EGR 9', vessel: 'LEVIATHAN', nationality: 'Irish' },
  { name: 'Wesley Alistair Dawson', department: 'Engineering', level: 'EGR 8', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Abner Roland Arengo', department: 'Engineering', level: 'EGR 1', vessel: 'LEVIATHAN', nationality: 'Gibraltarian' },
  { name: 'Christopher Barrios', department: 'Engineering', level: 'EGR 1', vessel: 'LEVIATHAN', nationality: 'American' },
  { name: 'Sophie Alexandra Jenkins', department: 'Interior', level: 'INT 6', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Reeve Jacqueline Smith', department: 'Interior', level: 'INT 5.1', vessel: 'LEVIATHAN', nationality: 'South African' },
  { name: 'Robin Kristofer Sjostrom', department: 'Galley', level: 'GAL 6', vessel: 'LEVIATHAN', nationality: 'Swedish' },
  { name: 'Rutger Eysvogel', department: 'Galley', level: 'GAL 6', vessel: 'LEVIATHAN', nationality: 'Dutch' },
  { name: 'Lennert van Santvoort', department: 'Galley', level: 'GAL 6.2', vessel: 'LEVIATHAN', nationality: 'Dutch' },
  { name: 'Stuart James Duffin', department: 'Galley', level: 'GAL 7.2', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Victoria Jane Pena-Lawes', department: 'Galley', level: 'GAL 4', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Marko Bratic', department: 'Tech', level: 'TEC 3.2', vessel: 'LEVIATHAN', nationality: 'Serbian' },
  { name: 'Marko Rase', department: 'Tech', level: 'TEC 3.2', vessel: 'LEVIATHAN', nationality: 'Slovenian' },
  { name: 'Philip Watson', department: 'Tech', level: 'TEC 4', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Rocky Montanari', department: 'Tech', level: 'TEC 4', vessel: 'LEVIATHAN', nationality: 'Italian' },
  { name: 'Mariam Susannah Joll', department: 'Purser', level: 'PUR 2.2', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Gemma Louise Read', department: 'Purser', level: 'PUR 4', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Lucy Louise Musgrave', department: 'Medical', level: 'MED 6.2', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Molly Jean Philip', department: 'Medical', level: 'MED 4', vessel: 'LEVIATHAN', nationality: 'British' },
  { name: 'Felipe Chacon Rodriguez', department: 'Dive', level: 'DIV 2', vessel: 'LEVIATHAN', nationality: 'Costa Rican' },
  { name: 'Peter Klarcich', department: 'Wellness', level: 'WEL 2', vessel: 'LEVIATHAN', nationality: 'Australian' },
  { name: 'Joseph Carrington Gregory Humphries', department: 'Wellness', level: 'WEL 3', vessel: 'LEVIATHAN', nationality: 'British' },
];

export const CREW_ROCINANTE: CrewMember[] = [
  { name: 'Matthew Brown', department: 'Deck', level: 'DEC 1.2', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Oliver Lucas Beattie', department: 'Deck', level: 'DEC 3', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Alec Douglas Hudson', department: 'Deck', level: 'DEC 5', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Cirilo Cosico Etpison', department: 'Deck', level: 'DEC 5', vessel: 'ROCINANTE', nationality: 'Filipino' },
  { name: 'Shane Francis Ross Rourke', department: 'Deck', level: 'DEC 9', vessel: 'ROCINANTE', nationality: 'Irish' },
  { name: 'Thomas Edward Christopher Green', department: 'Deck', level: 'DEC 10', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Adrian James Hibbard', department: 'Engineering', level: 'EGR 8', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Alan Reid Walker', department: 'Engineering', level: 'EGR 8', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Sebastian Blunt', department: 'Engineering', level: 'EGR 3', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'William Targett-Parker', department: 'Engineering', level: 'EGR 3', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Eoin Francis OMalley', department: 'Engineering', level: 'EGR 5', vessel: 'ROCINANTE', nationality: 'Irish' },
  { name: 'Amy Georgina Venn', department: 'Interior', level: 'INT 1.1', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Holly Rachel Hyde', department: 'Interior', level: 'INT 3', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Ulla Catarina Elisabeth Sjunesson', department: 'Interior', level: 'INT 6', vessel: 'ROCINANTE', nationality: 'Swedish' },
  { name: 'Megan Griffiths', department: 'Interior', level: 'INT 7', vessel: 'ROCINANTE', nationality: 'Welsh' },
  { name: 'Fabienne Canan Ortac', department: 'Interior', level: 'INT 8.1', vessel: 'ROCINANTE', nationality: 'Turkish' },
  { name: 'Chun Kui Wong', department: 'Galley', level: 'GAL 7.2', vessel: 'ROCINANTE', nationality: 'Hong Konger' },
  { name: 'Diego Hernandez Gonzalez', department: 'Galley', level: 'GAL 6.2', vessel: 'ROCINANTE', nationality: 'Mexican' },
  { name: 'Ross John Dunk', department: 'Galley', level: 'GAL 6.2', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Steven Craig Wilkinson', department: 'Galley', level: 'GAL 6.2', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Liam Michael Cosgrove', department: 'Dive', level: 'DIV 4', vessel: 'ROCINANTE', nationality: 'Irish' },
  { name: 'Kaylie Maree Watson', department: 'Dive', level: 'DIV 8', vessel: 'ROCINANTE', nationality: 'Australian' },
  { name: 'Robyn Smith', department: 'Dive', level: 'DIV 10', vessel: 'ROCINANTE', nationality: 'South African' },
  { name: 'Michael John Lewington', department: 'Tech', level: 'TEC 1', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Naude Heunis', department: 'Tech', level: 'TEC 1', vessel: 'ROCINANTE', nationality: 'South African' },
  { name: 'Petar Sakic', department: 'Tech', level: 'TEC 3.2', vessel: 'ROCINANTE', nationality: 'Croatian' },
  { name: 'Catherine Marjorie Simons', department: 'Purser', level: 'PUR 2.2', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Anje Clarke', department: 'Medical', level: 'MED 7.1', vessel: 'ROCINANTE', nationality: 'South African' },
  { name: 'David Graeme Leckie', department: 'Medical', level: 'MED 4', vessel: 'ROCINANTE', nationality: 'Scottish' },
  { name: 'Nina Reutlinger', department: 'Medical', level: 'MED 4', vessel: 'ROCINANTE', nationality: 'German' },
  { name: 'Julia August Paige Murphy', department: 'Wellness', level: 'WEL 1', vessel: 'ROCINANTE', nationality: 'Australian' },
  { name: 'Rebekah Jane Armstrong', department: 'Wellness', level: 'WEL 2', vessel: 'ROCINANTE', nationality: 'British' },
  { name: 'Siobhan Maire Egan', department: 'Wellness', level: 'WEL 2', vessel: 'ROCINANTE', nationality: 'Irish' },
];

export const CREW_XIPHIAS: CrewMember[] = [
  { name: 'Millicent Grace Brown-Haysom', department: 'Interior', level: 'INT 5.1', vessel: 'XIPHIAS', nationality: 'British' },
  { name: 'Clark Donald Hepworth', department: 'Engineering', level: 'EGR 7', vessel: 'XIPHIAS', nationality: 'Canadian' },
  { name: 'Michael Jolley', department: 'Engineering', level: 'EGR 11', vessel: 'XIPHIAS', nationality: 'British' },
];

export const ALL_CREW = [...CREW_DRAAK, ...CREW_LEVIATHAN, ...CREW_ROCINANTE, ...CREW_XIPHIAS];

export function getCrewByVessel(vesselSlug: string): CrewMember[] {
  const vesselMap: Record<string, CrewMember[]> = {
    draak: CREW_DRAAK,
    'game-changer': [],
    leviathan: CREW_LEVIATHAN,
    rocinante: CREW_ROCINANTE,
    xiphias: CREW_XIPHIAS,
    dagon: [],
    hydra: [],
  };
  return vesselMap[vesselSlug] || [];
}

export function getVesselBySlug(slug: string) {
  return VESSELS.find(v => v.slug === slug);
}

// Port directory for ISPS
export const PORT_DIRECTORY = [
  { locode: 'MCMON', portName: 'Monaco', country: 'Monaco', countryCode: 'MC' },
  { locode: 'ESBCN', portName: 'Barcelona', country: 'Spain', countryCode: 'ES' },
  { locode: 'ESPMI', portName: 'Palma de Mallorca', country: 'Spain', countryCode: 'ES' },
  { locode: 'FRNIC', portName: 'Nice', country: 'France', countryCode: 'FR' },
  { locode: 'FRCNR', portName: 'Cannes', country: 'France', countryCode: 'FR' },
  { locode: 'FRMRS', portName: 'Marseille', country: 'France', countryCode: 'FR' },
  { locode: 'ITSPE', portName: 'La Spezia', country: 'Italy', countryCode: 'IT' },
  { locode: 'ITGOA', portName: 'Genoa', country: 'Italy', countryCode: 'IT' },
  { locode: 'ITNAP', portName: 'Naples', country: 'Italy', countryCode: 'IT' },
  { locode: 'GRPIR', portName: 'Piraeus', country: 'Greece', countryCode: 'GR' },
  { locode: 'GRCFU', portName: 'Corfu', country: 'Greece', countryCode: 'GR' },
  { locode: 'HRSPU', portName: 'Split', country: 'Croatia', countryCode: 'HR' },
  { locode: 'HRDBV', portName: 'Dubrovnik', country: 'Croatia', countryCode: 'HR' },
  { locode: 'TRIST', portName: 'Istanbul', country: 'Turkey', countryCode: 'TR' },
  { locode: 'TRBOD', portName: 'Bodrum', country: 'Turkey', countryCode: 'TR' },
  { locode: 'EGALY', portName: 'Alexandria', country: 'Egypt', countryCode: 'EG' },
  { locode: 'AEDXB', portName: 'Dubai', country: 'UAE', countryCode: 'AE' },
  { locode: 'GBSOU', portName: 'Southampton', country: 'United Kingdom', countryCode: 'GB' },
  { locode: 'GBFAL', portName: 'Falmouth', country: 'United Kingdom', countryCode: 'GB' },
  { locode: 'NLRTM', portName: 'Rotterdam', country: 'Netherlands', countryCode: 'NL' },
  { locode: 'NLAMS', portName: 'Amsterdam', country: 'Netherlands', countryCode: 'NL' },
  { locode: 'PTLIS', portName: 'Lisbon', country: 'Portugal', countryCode: 'PT' },
  { locode: 'USMIA', portName: 'Miami', country: 'United States', countryCode: 'US' },
  { locode: 'BSFPO', portName: 'Freeport', country: 'Bahamas', countryCode: 'BS' },
  { locode: 'KYGER', portName: 'Georgetown', country: 'Cayman Islands', countryCode: 'KY' },
  { locode: 'NZAKL', portName: 'Auckland', country: 'New Zealand', countryCode: 'NZ' },
  { locode: 'SGSIN', portName: 'Singapore', country: 'Singapore', countryCode: 'SG' },
  { locode: 'MYPKG', portName: 'Port Klang', country: 'Malaysia', countryCode: 'MY' },
  { locode: 'NOSVG', portName: 'Stavanger', country: 'Norway', countryCode: 'NO' },
  { locode: 'NOBGO', portName: 'Bergen', country: 'Norway', countryCode: 'NO' },
];

// Seed ports of call for DRAAK (Mediterranean itinerary)
export const DRAAK_PORTS_OF_CALL = [
  { portName: 'Monaco', country: 'Monaco', countryCode: 'MC', unlocode: 'MCMON', securityLevel: 1, arrival: '2026-02-15T14:00:00Z', departure: null, dosRequired: false, dosCompleted: false, source: 'manual' as const },
  { portName: 'Barcelona', country: 'Spain', countryCode: 'ES', unlocode: 'ESBCN', securityLevel: 1, arrival: '2026-02-10T08:00:00Z', departure: '2026-02-14T16:00:00Z', dosRequired: false, dosCompleted: false, source: 'itinerary' as const },
  { portName: 'Palma de Mallorca', country: 'Spain', countryCode: 'ES', unlocode: 'ESPMI', securityLevel: 1, arrival: '2026-02-03T12:00:00Z', departure: '2026-02-09T10:00:00Z', dosRequired: false, dosCompleted: false, source: 'manual' as const },
  { portName: 'Cannes', country: 'France', countryCode: 'FR', unlocode: 'FRCNR', securityLevel: 1, arrival: '2026-01-28T09:00:00Z', departure: '2026-02-02T15:00:00Z', dosRequired: false, dosCompleted: false, source: 'itinerary' as const },
  { portName: 'Nice', country: 'France', countryCode: 'FR', unlocode: 'FRNIC', securityLevel: 1, arrival: '2026-01-23T11:00:00Z', departure: '2026-01-27T08:00:00Z', dosRequired: false, dosCompleted: false, source: 'manual' as const },
  { portName: 'Genoa', country: 'Italy', countryCode: 'IT', unlocode: 'ITGOA', securityLevel: 1, arrival: '2026-01-17T07:00:00Z', departure: '2026-01-22T14:00:00Z', dosRequired: false, dosCompleted: false, source: 'manual' as const },
  { portName: 'La Spezia', country: 'Italy', countryCode: 'IT', unlocode: 'ITSPE', securityLevel: 1, arrival: '2026-01-12T10:00:00Z', departure: '2026-01-16T09:00:00Z', dosRequired: false, dosCompleted: false, source: 'itinerary' as const },
  { portName: 'Naples', country: 'Italy', countryCode: 'IT', unlocode: 'ITNAP', securityLevel: 1, arrival: '2026-01-06T06:00:00Z', departure: '2026-01-11T16:00:00Z', dosRequired: false, dosCompleted: false, source: 'manual' as const },
  { portName: 'Corfu', country: 'Greece', countryCode: 'GR', unlocode: 'GRCFU', securityLevel: 1, arrival: '2025-12-28T12:00:00Z', departure: '2026-01-04T10:00:00Z', dosRequired: false, dosCompleted: false, source: 'itinerary' as const },
  { portName: 'Dubrovnik', country: 'Croatia', countryCode: 'HR', unlocode: 'HRDBV', securityLevel: 1, arrival: '2025-12-20T08:00:00Z', departure: '2025-12-27T14:00:00Z', dosRequired: false, dosCompleted: false, source: 'manual' as const },
];

// Checklist templates by department
export interface ChecklistTemplate {
  name: string;
  department: string;
  frequency: string;
  estimatedMinutes: number;
  items: string[];
  lastCompletedBy?: string;
  lastCompletedDate?: string;
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  // Deck
  {
    name: 'Anchor Windlass Pre-Departure Check',
    department: 'deck',
    frequency: 'weekly',
    estimatedMinutes: 15,
    items: [
      'Inspect windlass brake — check for wear and adjust',
      'Check anchor chain — inspect for corrosion/damage',
      'Test windlass motor — run up and down',
      'Verify chain counter — matches actual chain out',
      'Inspect chain locker — clear of debris',
      'Check hydraulic lines — no leaks, pressure normal',
      'Test emergency release — confirm operational',
      'Deck area clear — no obstructions around windlass',
    ],
    lastCompletedBy: 'Emil Schwarz',
    lastCompletedDate: '2026-02-15',
  },
  {
    name: 'Tender Launch & Recovery',
    department: 'deck',
    frequency: 'per_use',
    estimatedMinutes: 20,
    items: [
      'Check davit/crane condition and operation',
      'Verify tender fuel levels',
      'Safety equipment check (lifejackets, flares)',
      'Communication equipment test',
      'Engine start and idle check',
      'Deck crew positioned and briefed',
    ],
    lastCompletedBy: 'Luke Petzer',
    lastCompletedDate: '2026-02-12',
  },
  {
    name: 'Deck Safety Equipment Inspection',
    department: 'deck',
    frequency: 'monthly',
    estimatedMinutes: 45,
    items: [
      'Liferafts — check hydrostatic release and expiry',
      'Lifejackets — count and inspect condition',
      'Lifebuoys — check lights and smoke signals',
      'Fire hoses and nozzles — pressure test',
      'EPIRB — check battery and registration',
      'SART — test function',
      'Rocket parachute flares — count and expiry',
      'Man overboard equipment — test rescue sling',
    ],
    lastCompletedBy: 'Emil Schwarz',
    lastCompletedDate: '2026-02-01',
  },
  {
    name: 'Mooring Equipment Check',
    department: 'deck',
    frequency: 'per_port',
    estimatedMinutes: 10,
    items: [
      'Mooring lines — inspect for chafe and wear',
      'Fenders — check condition and pressure',
      'Bollards and fairleads — clean and inspect',
      'Gangway — test operation and lighting',
    ],
    lastCompletedBy: 'Oliver Kincart',
    lastCompletedDate: '2026-02-14',
  },
  {
    name: 'Navigation Lights Check',
    department: 'deck',
    frequency: 'daily',
    estimatedMinutes: 5,
    items: [
      'Port and starboard sidelights operational',
      'Masthead light operational',
      'Stern light operational',
      'Anchor light operational',
      'NUC lights operational',
    ],
    lastCompletedBy: 'Emile McPherson',
    lastCompletedDate: '2026-02-21',
  },
  // Engineering
  {
    name: 'Engine Room Daily Round',
    department: 'engineering',
    frequency: 'daily',
    estimatedMinutes: 30,
    items: [
      'Main engine parameters — oil pressure, temps, RPM',
      'Generator parameters — load, fuel consumption',
      'Bilge levels — check all bilge wells',
      'Oil mist detector — confirm operational',
      'Fire detection panel — no alarms',
      'Cooling water systems — temperatures normal',
      'Fuel system — no leaks, levels recorded',
      'Air conditioning plant — running normal',
    ],
    lastCompletedBy: 'Callum Brown',
    lastCompletedDate: '2026-02-21',
  },
  {
    name: 'Generator Changeover Procedure',
    department: 'engineering',
    frequency: 'weekly',
    estimatedMinutes: 25,
    items: [
      'Incoming generator pre-checks complete',
      'Load transfer initiated smoothly',
      'Frequency and voltage matched',
      'Bus tie breaker operated correctly',
      'Old generator unloaded and shut down',
      'Log book entries made',
    ],
    lastCompletedBy: 'Douglas Cullingworth',
    lastCompletedDate: '2026-02-13',
  },
  {
    name: 'Fuel Transfer Checklist',
    department: 'engineering',
    frequency: 'per_use',
    estimatedMinutes: 15,
    items: [
      'SOPEP equipment positioned',
      'Scuppers plugged',
      'Transfer pump tested',
      'Valve lineup confirmed',
      'Overflow alarm tested',
      'Communication with bridge established',
    ],
    lastCompletedBy: 'Joshua Walters',
    lastCompletedDate: '2026-02-10',
  },
  {
    name: 'Black/Grey Water System Check',
    department: 'engineering',
    frequency: 'weekly',
    estimatedMinutes: 20,
    items: [
      'Sewage treatment plant operating normally',
      'Holding tank levels checked',
      'Discharge valve positions verified',
      'System alarms tested',
      'Effluent quality sample taken',
    ],
    lastCompletedBy: 'Jake Thompson',
    lastCompletedDate: '2026-02-13',
  },
  // Bridge
  {
    name: 'Pre-Departure Checklist',
    department: 'bridge',
    frequency: 'per_departure',
    estimatedMinutes: 30,
    items: [
      'Weather and sea state reviewed',
      'Passage plan approved and briefed',
      'Navigation equipment tested (radar, GPS, AIS)',
      'Steering gear tested (main and emergency)',
      'Engine room notified — engines ready',
      'Crew mustered at stations',
      'All watertight doors secure',
      'Gangway and shore connections removed',
      'Mooring party ready',
      'Port clearance obtained',
    ],
    lastCompletedBy: 'Phillip Carter',
    lastCompletedDate: '2026-02-14',
  },
  {
    name: 'Watch Handover Checklist',
    department: 'bridge',
    frequency: 'per_watch',
    estimatedMinutes: 10,
    items: [
      'Current position and course briefed',
      'Traffic situation briefed',
      'Weather conditions and forecast',
      'Outstanding Master\'s orders',
      'Equipment status and defects',
      'Upcoming waypoints and hazards',
    ],
    lastCompletedBy: 'Jack Sanguinetti',
    lastCompletedDate: '2026-02-21',
  },
  {
    name: 'GMDSS Daily Test',
    department: 'bridge',
    frequency: 'daily',
    estimatedMinutes: 10,
    items: [
      'VHF DSC test call completed',
      'MF/HF radio tested',
      'Inmarsat-C log check',
      'NAVTEX messages reviewed',
      'Battery condition checked',
    ],
    lastCompletedBy: 'Juan Norman',
    lastCompletedDate: '2026-02-21',
  },
  // Interior
  {
    name: 'Guest Suite Preparation',
    department: 'interior',
    frequency: 'per_use',
    estimatedMinutes: 45,
    items: [
      'Linens — fresh, pressed, correctly placed',
      'Bathroom — deep clean, amenities restocked',
      'Climate control — set to preference',
      'Entertainment system — tested and working',
      'Welcome amenities placed',
      'Minibar stocked per preference sheet',
      'Flowers and decorations arranged',
    ],
    lastCompletedBy: 'Charlotte Elizabeth Williams',
    lastCompletedDate: '2026-02-18',
  },
  {
    name: 'Laundry Equipment Check',
    department: 'interior',
    frequency: 'weekly',
    estimatedMinutes: 15,
    items: [
      'Washing machines — lint traps cleaned',
      'Dryers — filters cleaned, vent clear',
      'Iron and press — temperature calibrated',
      'Detergent stock levels adequate',
      'Emergency shut-off tested',
    ],
    lastCompletedBy: 'Harriet Pascale Pugson',
    lastCompletedDate: '2026-02-13',
  },
  {
    name: 'Silver & Inventory Check',
    department: 'interior',
    frequency: 'monthly',
    estimatedMinutes: 60,
    items: [
      'Silverware count against inventory',
      'Crystal and glassware count',
      'China count and condition check',
      'Table linen count',
      'Guest amenity stock levels',
      'Report any damaged or missing items',
    ],
    lastCompletedBy: 'Allabama Isabelle Wyke',
    lastCompletedDate: '2026-02-01',
  },
  // Galley
  {
    name: 'Galley Hygiene Inspection',
    department: 'galley',
    frequency: 'daily',
    estimatedMinutes: 20,
    items: [
      'Food preparation surfaces sanitised',
      'Hand washing stations stocked',
      'Waste bins emptied and lined',
      'Floor clean and dry',
      'Equipment clean and in good order',
      'Pest control measures in place',
    ],
    lastCompletedBy: 'Azraa Hayat',
    lastCompletedDate: '2026-02-21',
  },
  {
    name: 'Cold Store Temperature Log',
    department: 'galley',
    frequency: 'daily',
    estimatedMinutes: 10,
    items: [
      'Walk-in fridge temperature recorded',
      'Walk-in freezer temperature recorded',
      'Reach-in units temperature recorded',
      'All temperatures within safe range',
      'Door seals checked',
    ],
    lastCompletedBy: 'Carola Villasana',
    lastCompletedDate: '2026-02-21',
  },
  {
    name: 'Food Safety HACCP Check',
    department: 'galley',
    frequency: 'weekly',
    estimatedMinutes: 30,
    items: [
      'Food delivery records reviewed',
      'Storage rotation (FIFO) verified',
      'Cooking temperature logs reviewed',
      'Allergen management procedures followed',
      'Cleaning schedule adherence checked',
      'Staff hygiene standards confirmed',
    ],
    lastCompletedBy: 'Alex Edward Sawyer',
    lastCompletedDate: '2026-02-13',
  },
  // Medical
  {
    name: 'Medical Stores Inventory',
    department: 'medical',
    frequency: 'monthly',
    estimatedMinutes: 45,
    items: [
      'Medication expiry dates checked',
      'Stock levels against minimum requirements',
      'Controlled substances register verified',
      'Medical equipment calibrated',
      'Oxygen supply levels checked',
      'First aid kits inspected and restocked',
    ],
    lastCompletedBy: 'Daniel Richard Lobjoit',
    lastCompletedDate: '2026-02-01',
  },
  {
    name: 'AED & Emergency Equipment Check',
    department: 'medical',
    frequency: 'weekly',
    estimatedMinutes: 15,
    items: [
      'AED self-test completed — green indicator',
      'AED pads — within expiry, sealed',
      'Spare battery available',
      'Oxygen resuscitator tested',
      'Emergency drugs bag sealed and stocked',
    ],
    lastCompletedBy: 'Jarod Martin Menger',
    lastCompletedDate: '2026-02-13',
  },
  {
    name: 'Controlled Drugs Register',
    department: 'medical',
    frequency: 'daily',
    estimatedMinutes: 10,
    items: [
      'Cabinet locked and secure',
      'Stock count matches register',
      'No discrepancies noted',
      'Witnessed and signed',
    ],
    lastCompletedBy: 'Levinus Van Schalkwyk',
    lastCompletedDate: '2026-02-21',
  },
  // Dive
  {
    name: 'Dive Equipment Pre-Dive Check',
    department: 'dive',
    frequency: 'per_dive',
    estimatedMinutes: 20,
    items: [
      'BCD inflator — function test',
      'Regulator — breathing test',
      'Tank pressure — minimum 200 bar',
      'Weights — correct for diver',
      'Mask, fins, exposure suit — condition check',
      'Dive computer — battery and function',
      'Emergency signal devices',
    ],
    lastCompletedBy: 'Michaella Sylvia Lampe',
    lastCompletedDate: '2026-02-19',
  },
  {
    name: 'Compressor Maintenance Check',
    department: 'dive',
    frequency: 'weekly',
    estimatedMinutes: 25,
    items: [
      'Air quality test completed',
      'Oil level checked and topped up',
      'Filter change schedule reviewed',
      'Intake filter clean',
      'Safety valve tested',
    ],
    lastCompletedBy: 'Dafydd Thomas',
    lastCompletedDate: '2026-02-13',
  },
  {
    name: 'Chamber Readiness Check',
    department: 'dive',
    frequency: 'daily',
    estimatedMinutes: 15,
    items: [
      'Chamber pressurisation test',
      'O2 supply adequate',
      'Communications system tested',
      'Medical kit inside and stocked',
      'Operator briefed and available',
    ],
    lastCompletedBy: 'Michaella Sylvia Lampe',
    lastCompletedDate: '2026-02-21',
  },
  // Safety (cross-departmental)
  {
    name: 'Fire Detection System Test',
    department: 'safety',
    frequency: 'weekly',
    estimatedMinutes: 30,
    items: [
      'Zone test — all zones reporting',
      'Smoke detector spot checks',
      'Heat detector spot checks',
      'Manual call point test',
      'Fire panel alarms tested',
      'Ventilation fire dampers tested',
    ],
    lastCompletedBy: 'Callum Brown',
    lastCompletedDate: '2026-02-13',
  },
];

// Frequent routes for flights
export const FREQUENT_ROUTES = [
  { origin: 'AMS', destination: 'SOU', frequency: 41, description: 'Amsterdam ↔ Southampton' },
  { origin: 'AMS', destination: 'NCE', frequency: 28, description: 'Amsterdam ↔ Nice' },
  { origin: 'LHR', destination: 'NCE', frequency: 22, description: 'London Heathrow ↔ Nice' },
  { origin: 'AKL', destination: 'SIN', frequency: 15, description: 'Auckland ↔ Singapore' },
  { origin: 'SOU', destination: 'NCE', frequency: 12, description: 'Southampton ↔ Nice' },
];

// Sample flight bookings
export const SAMPLE_BOOKINGS = [
  { crewName: 'Phillip Carter', origin: 'AMS', destination: 'NCE', date: '2026-02-22', flightNumber: 'BA1234', status: 'confirmed' as const },
  { crewName: 'Jack Sanguinetti', origin: 'SOU', destination: 'AMS', date: '2026-02-25', flightNumber: 'EJ4521', status: 'confirmed' as const },
  { crewName: 'Emil Schwarz', origin: 'AKL', destination: 'SIN', date: '2026-03-01', flightNumber: null, status: 'searching' as const },
  { crewName: 'Callum Brown', origin: 'LHR', destination: 'NCE', date: '2026-03-05', flightNumber: 'BA2381', status: 'confirmed' as const },
  { crewName: 'Charlotte Elizabeth Williams', origin: 'SOU', destination: 'NCE', date: '2026-03-08', flightNumber: null, status: 'pending' as const },
];
