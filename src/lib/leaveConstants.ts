export interface LeaveStatusCode {
  code: string;
  label: string;
  category: 'accrued' | 'deducted' | 'neutral';
  color: string;
  bgColor: string;
}

export const LEAVE_STATUS_CODES: LeaveStatusCode[] = [
  { code: 'F', label: 'On Board (Time for Time Accrued)', category: 'accrued', color: '#2563eb', bgColor: '#dbeafe' },
  { code: 'Q', label: 'PBQ Leave Accrued', category: 'accrued', color: '#7c3aed', bgColor: '#ede9fe' },
  { code: 'L', label: 'Leave Used', category: 'deducted', color: '#dc2626', bgColor: '#fee2e2' },
  { code: 'T', label: 'Travel Day', category: 'neutral', color: '#f59e0b', bgColor: '#fef3c7' },
  { code: 'CD', label: 'Crew Development', category: 'neutral', color: '#0891b2', bgColor: '#cffafe' },
  { code: 'M', label: 'Medical Leave Paid', category: 'neutral', color: '#ec4899', bgColor: '#fce7f3' },
  { code: 'PPL', label: 'Paid Parental Leave', category: 'neutral', color: '#8b5cf6', bgColor: '#f3e8ff' },
  { code: 'CL', label: 'Compassionate Leave', category: 'neutral', color: '#6366f1', bgColor: '#e0e7ff' },
  { code: 'N', label: 'Neutral Leave', category: 'neutral', color: '#64748b', bgColor: '#f1f5f9' },
  { code: 'U', label: 'Unpaid Leave', category: 'neutral', color: '#334155', bgColor: '#e2e8f0' },
  { code: 'R', label: 'Rotational / Contract', category: 'neutral', color: '#059669', bgColor: '#d1fae5' },
];

export const STATUS_CODE_MAP = Object.fromEntries(
  LEAVE_STATUS_CODES.map(s => [s.code, s])
);

export const LEAVE_DEPARTMENTS = [
  'All',
  'Bridge',
  'Deck',
  'Engineering',
  'Interior',
  'Galley',
  'Medics',
  'Dive',
  'Media',
  'Fleet Chefs',
] as const;

export type LeaveDepartment = typeof LEAVE_DEPARTMENTS[number];

export interface CrewLeaveEntry {
  id: string;
  crew_id: string;
  date: string;
  status_code: string;
  company_id: string;
  vessel_id: string | null;
}

export interface CrewLeaveCarryover {
  id: string;
  crew_id: string;
  year: number;
  carryover_days: number;
  company_id: string;
}

export interface CrewLeaveLockedMonth {
  id: string;
  year: number;
  month: number;
  company_id: string;
  vessel_id: string | null;
  locked_at: string;
  locked_by: string | null;
}

export interface CrewLeaveRequest {
  id: string;
  crew_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'declined';
  company_id: string;
  vessel_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface CrewMemberLeave {
  userId: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  entries: Record<string, string>; // date -> status_code
  carryover: number;
  counts: Record<string, number>;
  balance: number;
}

// Seed data for crew with departments
export const CREW_SEED_DATA = [
  // BRIDGE
  { lastName: 'Berriman', firstName: 'Digby', position: 'Captain', department: 'Bridge', carryover: 37 },
  { lastName: 'Carter', firstName: 'Phil', position: 'Captain', department: 'Bridge', carryover: 14 },
  { lastName: 'Tyrrell', firstName: 'Simon', position: 'Captain', department: 'Bridge', carryover: 48 },
  { lastName: 'Atkins', firstName: 'Georgia', position: 'Temp Chief Officer', department: 'Bridge', carryover: 42 },
  { lastName: 'Cheney', firstName: 'Zachary', position: 'Chief Officer', department: 'Bridge', carryover: 14 },
  { lastName: 'Coldicutt', firstName: 'Mitchell', position: 'Chief Officer', department: 'Bridge', carryover: 42 },
  { lastName: 'Norman', firstName: 'Juan-Craig', position: 'Chief Officer', department: 'Bridge', carryover: 42 },
  { lastName: 'Sanguinetti', firstName: 'Jack', position: 'Chief Officer', department: 'Bridge', carryover: 14 },
  { lastName: 'Fowler-Kok', firstName: 'Ben', position: 'First Officer', department: 'Bridge', carryover: 6 },
  { lastName: 'Neocleous', firstName: 'Louie', position: 'First Officer', department: 'Bridge', carryover: 32 },
  // DECK
  { lastName: 'Rohlfs', firstName: 'Vanessa', position: 'Deck Officer', department: 'Deck', carryover: 42 },
  { lastName: 'Coleman', firstName: 'Finn', position: 'Stew 2A', department: 'Deck', carryover: 0 },
  { lastName: 'Gregory', firstName: 'Matthew', position: 'Bosun', department: 'Deck', carryover: 12 },
  { lastName: 'Lisle', firstName: 'James', position: 'Bosun', department: 'Deck', carryover: 14 },
  { lastName: 'Lynch', firstName: 'Ambrogino', position: 'Bosun', department: 'Deck', carryover: 14 },
  { lastName: 'Schwarz', firstName: 'Emil', position: 'Bosun', department: 'Deck', carryover: 2 },
  { lastName: 'Smith', firstName: 'Matthew', position: 'Bosun', department: 'Deck', carryover: 14 },
  { lastName: 'Syred', firstName: 'Vincent', position: 'Bosun', department: 'Deck', carryover: 42 },
  { lastName: 'Seetio Nugroho', firstName: 'Widodo', position: 'Lead Deckhand', department: 'Deck', carryover: 27 },
  { lastName: 'Baxter', firstName: 'Louis', position: 'Deckhand', department: 'Deck', carryover: 0 },
  { lastName: 'Leadbetter', firstName: 'Sam', position: 'Deckhand', department: 'Deck', carryover: 15 },
  { lastName: 'Servos', firstName: 'Athanasios', position: 'Deckhand', department: 'Deck', carryover: 42 },
  { lastName: 'Aurelio', firstName: 'Ronaldo', position: 'Deckhand', department: 'Deck', carryover: 48 },
  { lastName: 'Pollard', firstName: 'Ed', position: 'Deckhand', department: 'Deck', carryover: 0 },
  { lastName: 'Hurst', firstName: 'Michael', position: 'Deckhand', department: 'Deck', carryover: 0 },
  // ENGINEERING
  { lastName: 'Brown', firstName: 'Callum', position: 'Chief Engineer', department: 'Engineering', carryover: 32 },
  { lastName: 'Cullingworth', firstName: 'Doug', position: 'Chief Engineer', department: 'Engineering', carryover: 14 },
  { lastName: 'Heafield', firstName: 'Stephen', position: 'Chief Engineer', department: 'Engineering', carryover: 14 },
  { lastName: 'Walker', firstName: 'Alan', position: 'Chief Engineer', department: 'Engineering', carryover: 8 },
  { lastName: 'Hibbard', firstName: 'Adrian', position: 'Chief Engineer', department: 'Engineering', carryover: 0 },
  { lastName: 'Rymer', firstName: 'Ashley', position: 'First Engineering', department: 'Engineering', carryover: 14 },
  { lastName: 'Hickman', firstName: 'Richard', position: '2nd Engineer', department: 'Engineering', carryover: 70 },
  { lastName: 'Hughson', firstName: 'Jack', position: '2nd Engineer', department: 'Engineering', carryover: 3 },
  { lastName: 'Reid', firstName: 'Sam', position: '2nd Engineer', department: 'Engineering', carryover: 14 },
  { lastName: 'Targett-Parker', firstName: 'Will', position: 'Engineer (Study Leave)', department: 'Engineering', carryover: 3 },
  { lastName: 'Van Staden', firstName: 'Renaldo', position: 'AVIT', department: 'Engineering', carryover: 4 },
  { lastName: 'Venter', firstName: 'Renier', position: 'AVIT', department: 'Engineering', carryover: 34 },
  // INTERIOR
  { lastName: 'Simons', firstName: 'Catherine', position: 'Purser', department: 'Interior', carryover: 6 },
  { lastName: 'Murray', firstName: 'Jessii', position: 'Purser', department: 'Interior', carryover: 15 },
  { lastName: 'Brown', firstName: 'Sammie', position: 'Chief Stew', department: 'Interior', carryover: 14 },
  { lastName: 'de Gregory', firstName: 'Ellie', position: 'Chief Stew', department: 'Interior', carryover: 51 },
  { lastName: 'Ettling', firstName: 'Charlotte', position: 'Chief Stew', department: 'Interior', carryover: 35 },
  { lastName: 'Goodchild', firstName: 'Laura', position: 'Chief Stew', department: 'Interior', carryover: 12 },
  { lastName: 'Hehir', firstName: 'Amanda', position: 'Chief Stew', department: 'Interior', carryover: 14 },
  { lastName: 'Sjunesson', firstName: 'Catarina', position: 'Chief Stew', department: 'Interior', carryover: 0 },
  { lastName: 'van der Walt', firstName: 'Roxy', position: 'Chief Stew', department: 'Interior', carryover: 24 },
  { lastName: 'Wyke', firstName: 'Allabama', position: 'First Stew', department: 'Interior', carryover: 3 },
  { lastName: 'Panday', firstName: 'Dinesh', position: 'Lead Stew', department: 'Interior', carryover: 14 },
  { lastName: 'Schoeman', firstName: 'Milla', position: 'Lead Stew', department: 'Interior', carryover: 2 },
  { lastName: 'Co', firstName: 'Ivy', position: 'Stew', department: 'Interior', carryover: 42 },
  { lastName: 'Williamson', firstName: 'Megan', position: 'Stew', department: 'Interior', carryover: 0 },
  { lastName: 'Venn', firstName: 'Amy', position: 'Stew', department: 'Interior', carryover: 0 },
  { lastName: "O'Malley", firstName: 'Kirsty', position: 'Hair/Stew', department: 'Interior', carryover: 0 },
  { lastName: 'Ros', firstName: 'Agnes', position: 'Hair/Stew', department: 'Interior', carryover: 0 },
  { lastName: 'Protopsaltis', firstName: 'Sofia', position: 'Stew 1A', department: 'Interior', carryover: 0 },
  { lastName: 'Lumandas', firstName: 'Jay', position: 'Laundry Master', department: 'Interior', carryover: 0 },
  { lastName: 'Pangatungan', firstName: 'Marvin', position: 'Laundry Master', department: 'Interior', carryover: 0 },
  // GALLEY
  { lastName: 'Sjostrom', firstName: 'Robin', position: 'Chef', department: 'Galley', carryover: 2 },
  { lastName: 'Wadsworth', firstName: 'Henry', position: 'Chef', department: 'Galley', carryover: -4 },
  { lastName: 'Wilkinson', firstName: 'Steve', position: 'Chef', department: 'Galley', carryover: 0 },
  { lastName: 'Hayat', firstName: 'Azraa', position: 'Chef', department: 'Galley', carryover: 8 },
  { lastName: 'Pena', firstName: 'Victoria', position: 'Chef', department: 'Galley', carryover: 0 },
  { lastName: 'Hood', firstName: 'Toby', position: 'Chef', department: 'Galley', carryover: 0 },
  // MEDICS
  { lastName: 'van Schalkwyk', firstName: 'Janus', position: 'Medic', department: 'Medics', carryover: 2 },
  { lastName: 'Phillips', firstName: 'Molly', position: 'Medic', department: 'Medics', carryover: 0 },
  { lastName: 'Ruetlinger', firstName: 'Nina', position: 'Nurse (Study Leave)', department: 'Medics', carryover: 31 },
  // DIVE
  { lastName: 'Beard', firstName: 'Adam', position: 'Dive Instructor', department: 'Dive', carryover: 28 },
  { lastName: 'Thomas', firstName: 'Daffyd', position: 'Dive Instructor', department: 'Dive', carryover: -6 },
  { lastName: 'Lamp', firstName: 'Michaella', position: 'Dive Instructor', department: 'Dive', carryover: 0 },
  { lastName: 'Valenti', firstName: 'Jessica', position: 'Dive Instructor', department: 'Dive', carryover: 0 },
  // MEDIA
  { lastName: 'Lewington', firstName: 'Michael', position: 'Media', department: 'Media', carryover: 6 },
  { lastName: 'Heunis', firstName: 'Naude', position: 'Media', department: 'Media', carryover: 0 },
];
