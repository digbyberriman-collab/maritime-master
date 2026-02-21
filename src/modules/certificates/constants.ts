// Certificate types
export const CERTIFICATE_TYPES = [
  { value: 'DOC', label: 'Document of Compliance' },
  { value: 'Statutory', label: 'Statutory Certificate' },
  { value: 'Class', label: 'Classification Certificate' },
  { value: 'Crew', label: 'Crew Certificate' },
  { value: 'Equipment', label: 'Equipment Certificate' },
] as const;

// Statutory certificate categories
export const STATUTORY_CATEGORIES = [
  { value: 'SMC', label: 'Safety Management Certificate' },
  { value: 'SOLAS_Radio', label: 'SOLAS Safety Radio Certificate' },
  { value: 'SOLAS_Equipment', label: 'SOLAS Safety Equipment Certificate' },
  { value: 'SOLAS_Construction', label: 'SOLAS Safety Construction Certificate' },
  { value: 'LoadLine', label: 'International Load Line Certificate' },
  { value: 'Tonnage', label: 'International Tonnage Certificate' },
  { value: 'IOPP', label: 'International Oil Pollution Prevention Certificate' },
  { value: 'IAPP', label: 'International Air Pollution Prevention Certificate' },
  { value: 'ISPP', label: 'International Sewage Pollution Prevention Certificate' },
  { value: 'Garbage', label: 'Garbage Management Plan Certificate' },
  { value: 'ISSC', label: 'International Ship Security Certificate' },
  { value: 'MLC', label: 'Maritime Labour Certificate' },
  { value: 'Other', label: 'Other Statutory Certificate' },
] as const;

// Class certificate categories
export const CLASS_CATEGORIES = [
  { value: 'Classification', label: 'Classification Certificate' },
  { value: 'Machinery', label: 'Machinery Certificate' },
  { value: 'Hull', label: 'Hull Certificate' },
  { value: 'Fire_Safety', label: 'Fire Fighting Equipment Certificate' },
  { value: 'LSA', label: 'Life Saving Appliances Certificate' },
  { value: 'Other', label: 'Other Class Certificate' },
] as const;

// Crew certificate categories
export const CREW_CATEGORIES = [
  { value: 'COC', label: 'Certificate of Competency (STCW)' },
  { value: 'COP', label: 'Certificate of Proficiency' },
  { value: 'Medical', label: 'Medical Fitness Certificate' },
  { value: 'Passport', label: 'Passport' },
  { value: 'Seaman_Book', label: "Seaman's Book" },
  { value: 'Endorsement', label: 'Flag State Endorsement' },
  { value: 'GMDSS', label: 'GMDSS Certificate' },
  { value: 'HUET', label: 'HUET Certificate' },
  { value: 'BST', label: 'Basic Safety Training' },
  { value: 'Advanced_FF', label: 'Advanced Fire Fighting' },
  { value: 'Medical_Care', label: 'Medical First Aid/Care' },
  { value: 'Survival_Craft', label: 'Survival Craft & Rescue Boats' },
  { value: 'Tanker', label: 'Tanker Training' },
  { value: 'Other', label: 'Other Training Certificate' },
] as const;

// Issuing authorities
export const FLAG_STATES = [
  'Bahamas',
  'Bermuda',
  'Cayman Islands',
  'Cyprus',
  'Denmark',
  'Germany',
  'Greece',
  'Hong Kong',
  'Isle of Man',
  'Italy',
  'Liberia',
  'Malta',
  'Marshall Islands',
  'Netherlands',
  'Norway',
  'Panama',
  'Singapore',
  'United Kingdom',
  'United States',
  'Other',
] as const;

export const CLASS_SOCIETIES = [
  "Lloyd's Register (LR)",
  'DNV GL (DNV)',
  'American Bureau of Shipping (ABS)',
  'Bureau Veritas (BV)',
  'Nippon Kaiji Kyokai (ClassNK)',
  'Korean Register (KR)',
  'China Classification Society (CCS)',
  'RINA',
  'Indian Register of Shipping (IRS)',
  'Russian Maritime Register (RS)',
  'Other',
] as const;

// Alert thresholds
export const ALERT_THRESHOLDS = [
  { value: 90, label: '90 days before expiry' },
  { value: 60, label: '60 days before expiry' },
  { value: 30, label: '30 days before expiry' },
  { value: 7, label: '7 days before expiry' },
  { value: 0, label: 'On expiry date' },
] as const;

// Certificate status
export const CERTIFICATE_STATUS = {
  Valid: { label: 'Valid', color: 'bg-green-500' },
  Expiring_Soon: { label: 'Expiring Soon', color: 'bg-yellow-500' },
  Expired: { label: 'Expired', color: 'bg-red-500' },
  Suspended: { label: 'Suspended', color: 'bg-orange-500' },
  Superseded: { label: 'Superseded', color: 'bg-gray-500' },
} as const;

// Helper to get category options based on certificate type
export const getCategoryOptions = (type: string) => {
  switch (type) {
    case 'Statutory':
      return STATUTORY_CATEGORIES;
    case 'Class':
      return CLASS_CATEGORIES;
    case 'Crew':
      return CREW_CATEGORIES;
    default:
      return [];
  }
};

// Calculate certificate status based on expiry date and alert days
export const calculateCertificateStatus = (expiryDate: string, alertDays: number = 90): string => {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Expired';
  if (diffDays <= alertDays) return 'Expiring_Soon';
  return 'Valid';
};

// Calculate days until expiry (negative if expired)
export const daysUntilExpiry = (expiryDate: string): number => {
  const today = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};
