// API Types - Request/Response shapes for all endpoints

// ============================================================================
// COMMON TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

// ============================================================================
// AUTHENTICATION & USERS (7.1)
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: UserProfile;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
}

export interface AcceptInvitationRequest {
  token: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface SendInvitationRequest {
  userId: string;
}

export interface BulkInviteRequest {
  userIds: string[];
}

export interface BulkInviteResponse {
  sent: string[];
  failed: { userId: string; reason: string }[];
}

export interface UserProfile {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: string;
  rank?: string;
  position?: string;
  department?: 'DECK' | 'ENGINE' | 'INTERIOR' | 'GALLEY';
  passportNumber?: string;
  passportExpiry?: string;
  medicalExpiry?: string;
  visaStatus?: string;
  status: 'Active' | 'Pending' | 'Inactive';
  avatarUrl?: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: string;
  rank?: string;
  position?: string;
  department?: string;
  passportNumber?: string;
  passportExpiry?: string;
  medicalExpiry?: string;
  visaStatus?: string;
  avatarUrl?: string;
}

// ============================================================================
// VESSELS (7.2)
// ============================================================================

export interface Vessel {
  id: string;
  companyId: string;
  fleetGroupId?: string;
  name: string;
  imoNumber?: string;
  mmsi?: string;
  callSign?: string;
  flagState?: string;
  classSociety?: string;
  vesselType?: string;
  homePort?: string;
  grossTonnage?: number;
  lengthOverall?: number;
  beam?: number;
  draft?: number;
  yearBuilt?: number;
  builder?: string;
  operationalStatus: 'ACTIVE' | 'LAID_UP' | 'IN_YARD' | 'DELIVERY' | 'SOLD' | 'SCRAPPED';
  status: string;
  emergencyContacts?: VesselEmergencyContacts;
  minimumSafeManning?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface VesselEmergencyContacts {
  primaryContactName?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  secondaryContactName?: string;
  secondaryPhone?: string;
  secondaryEmail?: string;
  mrccContactInfo?: string;
  flagStateEmergencyContact?: string;
  classEmergencyContact?: string;
  medicalSupportContact?: string;
  securitySupportContact?: string;
  nearestPortAgentContact?: string;
}

export interface UpdateVesselRequest {
  name?: string;
  imoNumber?: string;
  mmsi?: string;
  callSign?: string;
  flagState?: string;
  classSociety?: string;
  vesselType?: string;
  homePort?: string;
  grossTonnage?: number;
  lengthOverall?: number;
  beam?: number;
  draft?: number;
  yearBuilt?: number;
  builder?: string;
  operationalStatus?: string;
}

export type UpdateEmergencyContactsRequest = VesselEmergencyContacts;

export interface VesselDashboard {
  vessel: Vessel;
  crewOnboard: number;
  captain?: { userId: string; name: string };
  alertsSummary: AlertSummary;
  upcomingDrills: DrillOccurrence[];
  expiringCertificates: VesselCertificate[];
  openDefects: number;
  openIncidents: number;
}

export interface CrewOnboardOverrideRequest {
  count: number;
  reason: string;
}

// ============================================================================
// FLEET MAP & AIS (7.3)
// ============================================================================

export interface VesselPosition {
  vesselId: string;
  vesselName: string;
  latitude: number;
  longitude: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: string;
  timestampUtc: string;
}

export interface FleetMapResponse {
  vessels: VesselPosition[];
  updatedAt: string;
}

export interface VesselMapDetail extends VesselPosition {
  vessel: Vessel;
  crewOnboard: number;
  captain?: string;
  nextPort?: string;
  eta?: string;
}

export interface AISHistoryRequest {
  vesselId: string;
  startDate: string;
  endDate: string;
}

export interface AISHistoryResponse {
  positions: VesselPosition[];
}

// ============================================================================
// CREW (7.4)
// ============================================================================

export interface CrewMember extends UserProfile {
  currentAssignment?: CrewAssignment;
  assignments?: CrewAssignment[];
}

export interface CrewAssignment {
  id: string;
  userId: string;
  vesselId: string;
  vesselName?: string;
  position: string;
  department?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  assignmentType: 'PERMANENT' | 'TEMPORARY' | 'ROTATION';
  createdAt: string;
}

export interface CreateAssignmentRequest {
  vesselId: string;
  position: string;
  department?: string;
  startDate: string;
  endDate?: string;
  assignmentType?: 'PERMANENT' | 'TEMPORARY' | 'ROTATION';
}

export interface CrewCertificate {
  id: string;
  userId: string;
  certificateType: string;
  certificateName: string;
  issuingAuthority?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  status: 'UPLOADED' | 'EXTRACTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'OBSOLETE';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCrewCertificateRequest {
  certificateType: string;
  certificateName: string;
  issuingAuthority?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
}

export interface CrewAttachment {
  id: string;
  userId: string;
  attachmentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType?: string;
  description?: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface UploadAttachmentRequest {
  attachmentType: string;
  description?: string;
  file: File;
}

export interface ImportCSVRequest {
  file: File;
  vesselId?: string;
}

export interface ImportCSVValidationResponse {
  valid: ImportCSVRow[];
  invalid: { row: number; errors: string[] }[];
  duplicates: { email: string; row: number }[];
}

export interface ImportCSVRow {
  firstName: string;
  lastName: string;
  email: string;
  rank?: string;
  nationality?: string;
  phone?: string;
  vesselId?: string;
  position?: string;
}

export interface ImportCSVConfirmRequest {
  rows: ImportCSVRow[];
  skipDuplicates: boolean;
}

export interface ImportCSVConfirmResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

// ============================================================================
// FLIGHTS (7.5)
// ============================================================================

export interface FlightRequest {
  id: string;
  crewId: string;
  crewName?: string;
  vesselId?: string;
  vesselName?: string;
  companyId: string;
  requestNumber: string;
  requestType: 'REPATRIATION' | 'JOINING' | 'LEAVE' | 'MEDEVAC' | 'OTHER';
  departFrom: string;
  arriveTo: string;
  earliestDepartureDate: string;
  latestDepartureDate?: string;
  preferredAirline?: string;
  baggageNotes?: string;
  passportNationality?: string;
  visaRequirements?: string;
  assignedAgentId?: string;
  status: 'DRAFT' | 'SUBMITTED_TO_AGENT' | 'BOOKED' | 'CONFIRMED' | 'TICKETED' | 'CANCELLED';
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  booking?: FlightBooking;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFlightRequestRequest {
  crewId: string;
  vesselId?: string;
  requestType: 'REPATRIATION' | 'JOINING' | 'LEAVE' | 'MEDEVAC' | 'OTHER';
  departFrom: string;
  arriveTo: string;
  earliestDepartureDate: string;
  latestDepartureDate?: string;
  preferredAirline?: string;
  baggageNotes?: string;
  passportNationality?: string;
  visaRequirements?: string;
  notes?: string;
}

export interface UpdateFlightRequestRequest {
  departFrom?: string;
  arriveTo?: string;
  earliestDepartureDate?: string;
  latestDepartureDate?: string;
  preferredAirline?: string;
  baggageNotes?: string;
  notes?: string;
}

export interface FlightBooking {
  id: string;
  flightRequestId: string;
  airline?: string;
  flightNumber?: string;
  departAirport?: string;
  arriveAirport?: string;
  departDatetimeUtc?: string;
  arriveDatetimeUtc?: string;
  bookingReference?: string;
  ticketNumber?: string;
  seatNumber?: string;
  costAmount?: number;
  currency?: string;
  bookedBy?: string;
  bookedAt?: string;
  confirmedAt?: string;
  itineraryFileUrl?: string;
  travelLetterFileUrl?: string;
  createdAt: string;
}

export interface CreateBookingRequest {
  airline?: string;
  flightNumber?: string;
  departAirport?: string;
  arriveAirport?: string;
  departDatetimeUtc?: string;
  arriveDatetimeUtc?: string;
  bookingReference?: string;
  costAmount?: number;
  currency?: string;
}

export interface GenerateTravelLetterRequest {
  flightRequestId: string;
}

// ============================================================================
// ALERTS (7.6)
// ============================================================================

export interface Alert {
  id: string;
  companyId: string;
  vesselId?: string;
  vesselName?: string;
  alertType: string;
  severityColor: 'red' | 'amber' | 'green';
  title: string;
  description?: string;
  dueAt?: string;
  status: 'active' | 'acknowledged' | 'snoozed' | 'resolved';
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  snoozedUntil?: string;
  lastSnoozeReason?: string;
  snoozeCount: number;
  resolvedBy?: string;
  resolvedAt?: string;
  sourceModule?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  ownerUserId?: string;
  ownerRole?: string;
  assignedToUserId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AlertSummary {
  red: number;
  amber: number;
  green: number;
  total: number;
}

export interface AcknowledgeAlertRequest {
  notes?: string;
}

export interface SnoozeAlertRequest {
  snoozeDays: number;
  reason: string;
}

export interface ResolveAlertRequest {
  notes?: string;
}

export interface ReassignAlertRequest {
  assignToUserId: string;
}

// ============================================================================
// SMS FORMS & CHECKLISTS (7.7)
// ============================================================================

export interface SMSTemplate {
  id: string;
  companyId: string;
  templateCode: string;
  templateName: string;
  templateType: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  fields: SMSTemplateField[];
  signaturesRequired: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SMSTemplateField {
  id: string;
  fieldType: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'textarea' | 'signature';
  label: string;
  required: boolean;
  options?: string[];
  defaultValue?: string;
}

export interface CreateTemplateRequest {
  templateCode: string;
  templateName: string;
  templateType: string;
  fields: Omit<SMSTemplateField, 'id'>[];
  signaturesRequired?: string[];
}

export interface SMSSubmission {
  id: string;
  templateId: string;
  templateName?: string;
  vesselId: string;
  vesselName?: string;
  submissionNumber: string;
  status: 'DRAFT' | 'PENDING_SIGNATURE' | 'SIGNED' | 'REJECTED' | 'AMENDED';
  fieldValues: Record<string, unknown>;
  signatures: SMSSignature[];
  createdBy: string;
  createdAt: string;
  submittedAt?: string;
  completedAt?: string;
}

export interface SMSSignature {
  role: string;
  userId: string;
  userName?: string;
  signedAt?: string;
  rejected?: boolean;
  rejectionReason?: string;
}

export interface CreateSubmissionRequest {
  templateId: string;
  vesselId: string;
  fieldValues: Record<string, unknown>;
}

export interface SignSubmissionRequest {
  signature: string;
}

export interface RejectSubmissionRequest {
  reason: string;
}

export interface AmendSubmissionRequest {
  fieldValues: Record<string, unknown>;
  amendmentReason: string;
}

// ============================================================================
// INCIDENTS & INVESTIGATIONS (7.8)
// ============================================================================

export interface Incident {
  id: string;
  companyId: string;
  vesselId?: string;
  vesselName?: string;
  incidentNumber: string;
  incidentType: 'INJURY' | 'NEAR_MISS' | 'PROPERTY_DAMAGE' | 'ENVIRONMENTAL' | 'SECURITY' | 'NAVIGATION' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  incidentDate: string;
  incidentTime?: string;
  location?: string;
  immediateCause?: string;
  rootCause?: string;
  causeCategories?: string[];
  involvedCrewIds?: string[];
  witnessCrewIds?: string[];
  injuriesReported: boolean;
  status: 'REPORTED' | 'UNDER_INVESTIGATION' | 'INVESTIGATION_COMPLETE' | 'CLOSED';
  investigationRequired?: boolean;
  investigationId?: string;
  noInvestigationReason?: string;
  noInvestigationApprovedBy?: string;
  noInvestigationApprovedAt?: string;
  shippingMasterNotified: boolean;
  shippingMasterMessage?: string;
  dpaNotifiedAt?: string;
  reportedBy: string;
  reportedAt: string;
  updatedAt: string;
}

export interface CreateIncidentRequest {
  vesselId?: string;
  incidentType: Incident['incidentType'];
  severity: Incident['severity'];
  title: string;
  description: string;
  incidentDate: string;
  incidentTime?: string;
  location?: string;
  injuriesReported?: boolean;
}

export interface UpdateIncidentRequest {
  incidentType?: Incident['incidentType'];
  severity?: Incident['severity'];
  title?: string;
  description?: string;
  incidentDate?: string;
  incidentTime?: string;
  location?: string;
  immediateCause?: string;
  rootCause?: string;
  causeCategories?: string[];
  involvedCrewIds?: string[];
  witnessCrewIds?: string[];
  injuriesReported?: boolean;
}

export interface OpenInvestigationRequest {
  leadInvestigatorId: string;
  teamMemberIds?: string[];
}

export interface NoInvestigationRequest {
  reason: string;
}

export interface NotifyShippingMasterRequest {
  message: string;
}

export interface Investigation {
  id: string;
  incidentId: string;
  investigationNumber: string;
  leadInvestigatorId: string;
  leadInvestigatorName?: string;
  teamMemberIds?: string[];
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED';
  startedAt?: string;
  completedAt?: string;
  findings?: string;
  recommendations?: string;
  createdAt: string;
}

export interface UpdateInvestigationRequest {
  findings?: string;
  recommendations?: string;
  status?: 'IN_PROGRESS' | 'PENDING_REVIEW';
}

// ============================================================================
// DRILLS & TRAINING (7.9)
// ============================================================================

export interface DrillType {
  id: string;
  drillCode: string;
  drillName: string;
  drillType: string;
  category: string;
  frequencyDays: number;
  isMandatory: boolean;
  requiredParticipants?: string[];
  description?: string;
  solasReference?: string;
  isActive: boolean;
  createdAt: string;
}

export interface DrillOccurrence {
  id: string;
  drillId: string;
  drillName?: string;
  drillType?: string;
  vesselId: string;
  vesselName?: string;
  scheduledDate?: string;
  conductedDate?: string;
  conductedTime?: string;
  participantCrewIds?: string[];
  absenteeCrewIds?: string[];
  absenteeReasons?: Record<string, string>;
  durationMinutes?: number;
  performanceRating?: 'SATISFACTORY' | 'NEEDS_IMPROVEMENT' | 'UNSATISFACTORY';
  observations?: string;
  correctiveActionsRequired: boolean;
  conductedById?: string;
  masterSignedById?: string;
  masterSignedAt?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';
  createdAt: string;
}

export interface CreateDrillOccurrenceRequest {
  drillId: string;
  vesselId: string;
  scheduledDate: string;
}

export interface UpdateDrillOccurrenceRequest {
  scheduledDate?: string;
  conductedDate?: string;
  conductedTime?: string;
  participantCrewIds?: string[];
  absenteeCrewIds?: string[];
  absenteeReasons?: Record<string, string>;
  durationMinutes?: number;
  performanceRating?: DrillOccurrence['performanceRating'];
  observations?: string;
  correctiveActionsRequired?: boolean;
}

export interface CompleteDrillRequest {
  conductedDate: string;
  conductedTime?: string;
  participantCrewIds: string[];
  absenteeCrewIds?: string[];
  absenteeReasons?: Record<string, string>;
  durationMinutes: number;
  performanceRating: DrillOccurrence['performanceRating'];
  observations?: string;
  correctiveActionsRequired?: boolean;
}

export interface DrillMatrix {
  crewId?: string;
  vesselId: string;
  drillTypes: DrillType[];
  records: DrillMatrixRecord[];
}

export interface DrillMatrixRecord {
  drillId: string;
  crewId?: string;
  lastCompleted?: string;
  nextDue?: string;
  status: 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'NEVER';
}

export interface TrainingRecord {
  id: string;
  userId: string;
  userName?: string;
  vesselId?: string;
  trainingType: string;
  trainingName: string;
  completedDate?: string;
  expiryDate?: string;
  trainerName?: string;
  trainerId?: string;
  relatedAmendmentId?: string;
  certificateUrl?: string;
  notes?: string;
  status: 'COMPLETED' | 'PENDING' | 'EXPIRED';
  createdAt: string;
}

export interface CreateTrainingRecordRequest {
  userId: string;
  vesselId?: string;
  trainingType: string;
  trainingName: string;
  completedDate?: string;
  expiryDate?: string;
  trainerName?: string;
  trainerId?: string;
  notes?: string;
}

export interface FamiliarizationPlan {
  id: string;
  crewId: string;
  crewName?: string;
  vesselId: string;
  vesselName?: string;
  planType: '24_HOUR' | '7_DAY';
  startDate: string;
  dueDate: string;
  completedDate?: string;
  checklistItems: FamiliarizationItem[];
  supervisorId?: string;
  supervisorName?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  createdAt: string;
}

export interface FamiliarizationItem {
  item: string;
  completed: boolean;
  completedAt?: string;
  signedBy?: string;
}

export interface UpdateFamiliarizationRequest {
  checklistItems: FamiliarizationItem[];
}

// ============================================================================
// VESSEL CERTIFICATES (7.10)
// ============================================================================

export interface VesselCertificate {
  id: string;
  vesselId: string;
  certificateType: string;
  certificateName: string;
  issuingAuthority?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  annualSurveyDue?: string;
  intermediateSurveyDue?: string;
  renewalSurveyDue?: string;
  surveyWindowStart?: string;
  surveyWindowEnd?: string;
  hasConditions: boolean;
  conditionNotes?: string;
  conditionDueDate?: string;
  fileUrl?: string;
  fileName?: string;
  status: 'UPLOADED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVesselCertificateRequest {
  certificateType: string;
  certificateName: string;
  issuingAuthority?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  annualSurveyDue?: string;
  intermediateSurveyDue?: string;
  renewalSurveyDue?: string;
  hasConditions?: boolean;
  conditionNotes?: string;
  conditionDueDate?: string;
}

export interface ReviewCertificateRequest {
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
}

// ============================================================================
// EXTERNAL APIs (7.11)
// ============================================================================

export interface ExternalEmployerCrewResponse {
  crew: {
    id: string;
    firstName: string;
    lastName: string;
    rank?: string;
    nationality?: string;
    currentVesselId?: string;
    currentVesselName?: string;
    status: string;
  }[];
}

export interface ExternalAuditorVesselResponse {
  vessel: {
    id: string;
    name: string;
    imoNumber?: string;
    flagState?: string;
    classSociety?: string;
  };
  certificates: VesselCertificate[];
  drillRecords: DrillOccurrence[];
  smsSubmissions: SMSSubmission[];
  lastAudit?: {
    date: string;
    type: string;
    result: string;
  };
}

export interface ExternalAgentRequestsResponse {
  requests: FlightRequest[];
}
