/**
 * Seed Data for Maritime Master Demo
 * 
 * This file contains mock data to populate the application for demo purposes.
 * In a production environment, this data would come from a proper database.
 */

import { addDays, subDays, format } from 'date-fns';

// Helper function to generate random dates
const randomDate = (start: Date, end: Date): string => {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString();
};

// Helper function to generate random vessel names
const vesselNames = [
  'MV Atlantic Pioneer', 'MV Ocean Explorer', 'MV North Star', 'MV Pacific Voyager',
  'MV Eastern Dawn', 'MV Iron Duke', 'MV Grain Master', 'MV Coal Express',
  'MV Med Express', 'MV Tech Leader', 'MV Innovation', 'MV Southern Cross',
  'MV Arctic Wind', 'MV Tropical Storm', 'MV Desert Eagle'
];

// Crew names for demo
const crewMembers = [
  { firstName: 'John', lastName: 'Anderson', position: 'Master' },
  { firstName: 'Sarah', lastName: 'Johnson', position: 'Chief Officer' },
  { firstName: 'Mike', lastName: 'Rodriguez', position: 'Chief Engineer' },
  { firstName: 'Elena', lastName: 'Rossi', position: 'Second Officer' },
  { firstName: 'Robert', lastName: 'Chen', position: 'Second Engineer' },
  { firstName: 'Lisa', lastName: 'Brown', position: 'Third Officer' },
  { firstName: 'David', lastName: 'Wilson', position: 'Third Engineer' },
  { firstName: 'Maria', lastName: 'Garcia', position: 'Bosun' },
  { firstName: 'James', lastName: 'Taylor', position: 'AB Seaman' },
  { firstName: 'Anna', lastName: 'Martinez', position: 'Cook' },
  { firstName: 'Tom', lastName: 'Jackson', position: 'Oiler' },
  { firstName: 'Sophie', lastName: 'White', position: 'Cadet' },
  { firstName: 'Carlos', lastName: 'Lopez', position: 'Electrician' },
  { firstName: 'Emma', lastName: 'Thompson', position: 'Radio Officer' },
  { firstName: 'Alex', lastName: 'Kumar', position: 'Fitter' }
];

// Mock Vessels Data
export const mockVessels = vesselNames.map((name, index) => ({
  id: `vessel-${index + 1}`,
  name,
  imo_number: `IMO ${1234567 + index}`,
  type: ['Bulk Carrier', 'Container Ship', 'Tanker', 'General Cargo'][index % 4],
  flag_state: ['Panama', 'Liberia', 'Marshall Islands', 'Malta'][index % 4],
  classification_society: ['DNV GL', 'Lloyd\'s Register', 'ABS', 'BV'][index % 4],
  built_year: 2015 + (index % 8),
  gross_tonnage: 15000 + (index * 2500),
  deadweight: 25000 + (index * 5000),
  length_overall: 150 + (index * 10),
  beam: 20 + (index * 2),
  status: ['active', 'active', 'active', 'maintenance', 'active'][index % 5],
  current_port: ['Hamburg', 'Singapore', 'Los Angeles', 'Rotterdam', 'Shanghai'][index % 5],
  next_port: ['Rotterdam', 'Long Beach', 'Hamburg', 'Singapore', 'Antwerp'][index % 5],
  eta: addDays(new Date(), index % 10).toISOString(),
  created_at: randomDate(subDays(new Date(), 365), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Crew Data
export const mockCrew = crewMembers.flatMap((member, memberIndex) => 
  vesselNames.slice(0, 8).map((vesselName, vesselIndex) => ({
    id: `crew-${memberIndex}-${vesselIndex}`,
    first_name: member.firstName,
    last_name: member.lastName,
    position: member.position,
    vessel: vesselName,
    status: ['active', 'active', 'on_leave', 'signing_off'][Math.floor(Math.random() * 4)],
    email: `${member.firstName.toLowerCase()}.${member.lastName.toLowerCase()}@maritime.com`,
    phone: `+1-555-${Math.floor(Math.random() * 9000) + 1000}`,
    nationality: ['USA', 'UK', 'Philippines', 'India', 'Poland', 'Romania'][Math.floor(Math.random() * 6)],
    date_of_birth: randomDate(new Date(1970, 0, 1), new Date(1995, 11, 31)),
    joined_vessel: randomDate(subDays(new Date(), 180), new Date()),
    contract_end: addDays(new Date(), Math.floor(Math.random() * 180)).toISOString(),
    sea_service_months: Math.floor(Math.random() * 120) + 24,
    created_at: randomDate(subDays(new Date(), 365), new Date()),
    updated_at: randomDate(subDays(new Date(), 30), new Date())
  }))
).slice(0, 50); // Limit to 50 crew members

// Mock Incidents Data
export const mockIncidents = Array.from({ length: 25 }, (_, index) => ({
  id: `incident-${index + 1}`,
  incident_number: `INC-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
  vessel: vesselNames[index % vesselNames.length],
  incident_type: [
    'Near Miss', 'Minor Injury', 'Property Damage', 'Environmental', 'Security',
    'Equipment Failure', 'Fire', 'Collision', 'Grounding', 'Personal Injury'
  ][index % 10],
  severity: ['Low', 'Medium', 'High', 'Critical'][Math.floor(Math.random() * 4)],
  description: `Incident description for ${vesselNames[index % vesselNames.length]} - detailed report of the event and circumstances`,
  location: ['Bridge', 'Engine Room', 'Deck', 'Cargo Hold', 'Galley'][index % 5],
  incident_date: randomDate(subDays(new Date(), 180), new Date()),
  reported_by: crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName,
  status: ['Open', 'Under Investigation', 'Closed', 'Pending'][Math.floor(Math.random() * 4)],
  created_at: randomDate(subDays(new Date(), 180), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Certificates Data
export const mockCertificates = Array.from({ length: 40 }, (_, index) => ({
  id: `cert-${index + 1}`,
  certificate_name: [
    'Safety Management Certificate', 'ISSC', 'Cargo Ship Safety Certificate',
    'Radio Safety Certificate', 'Load Line Certificate', 'Tonnage Certificate',
    'IOPP Certificate', 'Crew Certificate of Competency', 'Medical Certificate',
    'STCW Certificate', 'Firefighting Certificate', 'Life Boat Certificate'
  ][index % 12],
  certificate_type: ['vessel', 'crew'][index % 2],
  certificate_number: `CERT-${String(index + 1).padStart(6, '0')}`,
  vessel: index % 2 === 0 ? vesselNames[index % vesselNames.length] : undefined,
  crew_member: index % 2 === 1 ? crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName : undefined,
  issuing_authority: ['MCA', 'USCG', 'Transport Canada', 'Panama Maritime Authority', 'Liberian Registry'][index % 5],
  issue_date: randomDate(subDays(new Date(), 1095), subDays(new Date(), 365)),
  expiry_date: randomDate(new Date(), addDays(new Date(), 730)),
  status: ['valid', 'expiring_soon', 'expired', 'renewal_required'][Math.floor(Math.random() * 4)],
  created_at: randomDate(subDays(new Date(), 365), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Drills Data
export const mockDrills = Array.from({ length: 30 }, (_, index) => ({
  id: `drill-${index + 1}`,
  drill_number: `DRILL-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`,
  vessel: vesselNames[index % vesselNames.length],
  drill_type: [
    'Fire Drill', 'Abandon Ship', 'Man Overboard', 'Collision Drill',
    'Security Drill', 'Oil Spill Response', 'Medical Emergency', 'Blackout Drill'
  ][index % 8],
  date_conducted: randomDate(subDays(new Date(), 90), new Date()),
  duration_minutes: 15 + (index % 45),
  participants_count: 8 + (index % 15),
  conducted_by: crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName,
  performance_rating: ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement'][Math.floor(Math.random() * 4)],
  observations: `Drill conducted successfully with good crew response. ${index % 3 === 0 ? 'Some areas for improvement identified.' : 'All procedures followed correctly.'}`,
  corrective_actions: index % 3 === 0 ? 'Additional training scheduled for next week' : null,
  next_scheduled: addDays(new Date(), Math.floor(Math.random() * 90) + 30).toISOString(),
  status: ['completed', 'overdue', 'scheduled'][Math.floor(Math.random() * 3)],
  created_at: randomDate(subDays(new Date(), 365), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Maintenance Data
export const mockMaintenance = Array.from({ length: 35 }, (_, index) => ({
  id: `maint-${index + 1}`,
  work_order: `WO-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
  vessel: vesselNames[index % vesselNames.length],
  equipment: [
    'Main Engine', 'Auxiliary Engine', 'Generator', 'Steering Gear',
    'Windlass', 'Fire Pump', 'Ballast Pump', 'HVAC System',
    'Navigation Equipment', 'Safety Equipment', 'Deck Crane', 'Boiler'
  ][index % 12],
  maintenance_type: ['Preventive', 'Corrective', 'Condition Based', 'Emergency'][index % 4],
  priority: ['Low', 'Medium', 'High', 'Critical'][Math.floor(Math.random() * 4)],
  description: `Maintenance work required for ${vesselNames[index % vesselNames.length]} equipment`,
  scheduled_date: index % 2 === 0 ? addDays(new Date(), Math.floor(Math.random() * 60)).toISOString() : null,
  completed_date: index % 3 === 0 ? randomDate(subDays(new Date(), 60), new Date()) : null,
  assigned_to: crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName,
  status: ['pending', 'in_progress', 'completed', 'overdue'][Math.floor(Math.random() * 4)],
  estimated_hours: 2 + (index % 20),
  actual_hours: index % 3 === 0 ? 2 + (index % 15) : null,
  cost_estimate: 500 + (index * 100),
  created_at: randomDate(subDays(new Date(), 180), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Training Records Data
export const mockTrainingRecords = Array.from({ length: 60 }, (_, index) => ({
  id: `training-${index + 1}`,
  crew_member: crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName,
  course_name: [
    'Basic Safety Training', 'Advanced Fire Fighting', 'Medical First Aid',
    'Personal Survival Techniques', 'Security Awareness', 'Leadership & Teamwork',
    'Bridge Resource Management', 'Engine Room Resource Management',
    'Cargo Handling', 'Maritime Environmental Awareness', 'ISPS Code Training'
  ][index % 11],
  training_provider: [
    'Maritime Training Institute', 'Safety Training Academy', 'International Maritime College',
    'Crew Training Center', 'Maritime Safety Institute'
  ][index % 5],
  completion_date: randomDate(subDays(new Date(), 730), new Date()),
  expiry_date: addDays(new Date(), Math.floor(Math.random() * 1460) + 365).toISOString(),
  certificate_number: `TRN-${String(index + 1).padStart(6, '0')}`,
  status: ['valid', 'expiring_soon', 'expired', 'renewal_due'][Math.floor(Math.random() * 4)],
  score: 75 + (index % 26), // Score between 75-100
  created_at: randomDate(subDays(new Date(), 365), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Audits Data
export const mockAudits = Array.from({ length: 20 }, (_, index) => ({
  id: `audit-${index + 1}`,
  audit_number: `AUD-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`,
  vessel: vesselNames[index % vesselNames.length],
  audit_type: [
    'ISM Audit', 'Port State Control', 'Flag State Inspection', 'Class Survey',
    'Customer Audit', 'Internal Audit', 'TMSA Audit', 'Insurance Survey'
  ][index % 8],
  auditor: [
    'Maritime Audit Services', 'Classification Society', 'Port Authority',
    'Flag State Authority', 'Customer Representative', 'Internal Auditor'
  ][index % 6],
  audit_date: randomDate(subDays(new Date(), 365), new Date()),
  status: ['scheduled', 'in_progress', 'completed', 'closed'][Math.floor(Math.random() * 4)],
  overall_rating: ['Satisfactory', 'Good', 'Excellent', 'Needs Improvement'][Math.floor(Math.random() * 4)],
  findings_count: Math.floor(Math.random() * 10),
  nc_count: Math.floor(Math.random() * 5), // Non-conformities
  observations_count: Math.floor(Math.random() * 8),
  next_audit_due: addDays(new Date(), Math.floor(Math.random() * 365) + 180).toISOString(),
  created_at: randomDate(subDays(new Date(), 365), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock CAPA (Corrective & Preventive Actions) Data
export const mockCAPAs = Array.from({ length: 25 }, (_, index) => ({
  id: `capa-${index + 1}`,
  capa_number: `CAPA-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
  vessel: vesselNames[index % vesselNames.length],
  source: ['Incident', 'Audit Finding', 'Near Miss', 'Internal Review', 'Customer Feedback'][index % 5],
  source_reference: `REF-${String(index + 1).padStart(4, '0')}`,
  description: `Corrective action required for vessel ${vesselNames[index % vesselNames.length]} to address identified non-conformity`,
  root_cause: [
    'Inadequate procedures', 'Human error', 'Equipment failure', 'Training deficiency',
    'Communication breakdown', 'Inadequate supervision', 'Poor planning'
  ][index % 7],
  corrective_action: `Implement corrective measures to prevent recurrence of the identified issue`,
  preventive_action: `Establish preventive measures to avoid similar issues across the fleet`,
  assigned_to: crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName,
  due_date: addDays(new Date(), Math.floor(Math.random() * 180) - 90).toISOString(), // Some overdue
  completion_date: index % 3 === 0 ? randomDate(subDays(new Date(), 60), new Date()) : null,
  status: ['open', 'in_progress', 'completed', 'overdue'][Math.floor(Math.random() * 4)],
  priority: ['Low', 'Medium', 'High', 'Critical'][Math.floor(Math.random() * 4)],
  verification_date: index % 4 === 0 ? addDays(new Date(), Math.floor(Math.random() * 30)).toISOString() : null,
  effectiveness_review: index % 5 === 0 ? 'Effective' : null,
  created_at: randomDate(subDays(new Date(), 180), new Date()),
  updated_at: randomDate(subDays(new Date(), 30), new Date())
}));

// Mock Documents Data
export const mockDocuments = Array.from({ length: 50 }, (_, index) => ({
  id: `doc-${index + 1}`,
  title: [
    'Safety Management Manual', 'Emergency Response Plan', 'Bridge Procedures',
    'Engine Room Procedures', 'Cargo Handling Manual', 'Security Plan',
    'Environmental Management Plan', 'Port State Control Checklist',
    'Fire Fighting Procedures', 'Medical Emergency Procedures'
  ][index % 10],
  document_number: `DOC-${String(index + 1).padStart(6, '0')}`,
  category: ['Manual', 'Procedure', 'Checklist', 'Plan', 'Policy'][index % 5],
  version: `${1 + Math.floor(index / 10)}.${index % 10}`,
  vessel_applicability: index % 3 === 0 ? 'All Vessels' : vesselNames[index % vesselNames.length],
  status: ['active', 'under_review', 'draft', 'archived'][Math.floor(Math.random() * 4)],
  review_due_date: addDays(new Date(), Math.floor(Math.random() * 365)).toISOString(),
  last_reviewed: randomDate(subDays(new Date(), 365), new Date()),
  approved_by: crewMembers[index % crewMembers.length].firstName + ' ' + crewMembers[index % crewMembers.length].lastName,
  file_size: `${1 + Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 9)} MB`,
  mandatory_reading: index % 4 === 0,
  created_at: randomDate(subDays(new Date(), 730), new Date()),
  updated_at: randomDate(subDays(new Date(), 90), new Date())
}));

// Function to initialize/populate demo data
export const initializeDemoData = () => {
  // In a real application, this would populate the database
  // For now, we'll just log that demo data is available
  console.log('Demo data initialized:', {
    vessels: mockVessels.length,
    crew: mockCrew.length,
    incidents: mockIncidents.length,
    certificates: mockCertificates.length,
    drills: mockDrills.length,
    maintenance: mockMaintenance.length,
    training: mockTrainingRecords.length,
    audits: mockAudits.length,
    capas: mockCAPAs.length,
    documents: mockDocuments.length
  });
  
  return {
    vessels: mockVessels,
    crew: mockCrew,
    incidents: mockIncidents,
    certificates: mockCertificates,
    drills: mockDrills,
    maintenance: mockMaintenance,
    training: mockTrainingRecords,
    audits: mockAudits,
    capas: mockCAPAs,
    documents: mockDocuments
  };
};

// Export individual datasets
export {
  vesselNames,
  crewMembers
};