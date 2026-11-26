import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';
import { SECTION_REDIRECTS } from '@/config/sitemap';
import { fleetNavRoutes, personalNavRoutes, retiredNavRoutes, vesselNavRoutes } from '@/app/router/navRoutes';
import { PersonalIndexRedirect, SettingsSectionRedirect } from '@/app/router/personalRoutes';
import { INBOX_PATH, PERSONAL_HOME, PERSONAL_SETTINGS_ROUTES } from '@/config/personalNav';
import ModuleRoute from '@/shared/components/ModuleRoute';
import KeepSearchNavigate from '@/app/router/KeepSearchNavigate';
import NotificationCenterRedirect from '@/modules/notifications/components/NotificationCenterRedirect';
import { lazyPage, type LazyPageOptions, type PageLoader } from '@/app/router/lazyPage';
import {
  FleetScope,
  HomeRedirect,
  LegacyRoute,
  PersonalScope,
  ScopeNotFound,
  VesselScopeRoute,
} from '@/app/router/scopes';
import NavAccessProvider from '@/app/nav/NavAccessProvider';
import {
  TOP_LEVEL_PLACEHOLDER_LEAVES,
  fleetManifestRoutes,
  personalManifestRoutes,
  placeholderElement,
  vesselManifestRoutes,
  workspaceManifestRoutes,
} from '@/app/router/manifestRoutes';
import { Building2 } from 'lucide-react';

// Main Pages - Keep critical path pages sync, lazy load the rest. The fleet
// dashboard is a lazy page of the dashboard module's manifest.
import Auth from '@/modules/auth/pages/Auth';
import ResetPassword from '@/modules/auth/pages/ResetPassword';

/**
 * A signed-in page. Every lazy page in this file is created once, here at
 * module scope, through lazyPage(): one LazyLoader fallback, one error
 * boundary per route (reset on navigation), and ProtectedRoute around it.
 * Pass `layout: DashboardLayout` for pages that do not render the shell
 * themselves.
 */
const protectedPage = <P extends object>(loader: PageLoader<P>, options: Omit<LazyPageOptions, 'guard'> = {}) =>
  lazyPage(loader, { guard: ProtectedRoute, ...options });

/** HRIS module gate for the legacy /hr dashboard. */
const HrisGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ModuleRoute moduleId="hris">{children}</ModuleRoute>
);

const withShell = { layout: DashboardLayout };

/**
 * An old route that now redirects into a scope (BUILD-PLAN B6). `from` is the
 * route's own pattern and must have an entry in LEGACY_REDIRECTS; when the
 * user has no target (no vessel, no fleet reach) the old page renders.
 */
const legacy = (from: string, page: React.ReactElement) => <LegacyRoute from={from}>{page}</LegacyRoute>;

// New module pages
const CompliancePage = protectedPage(() => import('@/modules/compliance/pages/CompliancePage'));
const NewChecklistsPage = protectedPage(() => import('@/modules/ism/pages/ChecklistsPage'));
const IndividualVesselDashboard = protectedPage(() => import('@/modules/vessels/pages/IndividualVesselDashboard'));

// Core pages
const Vessels = protectedPage(() => import('@/modules/vessels/pages/Vessels'));
const LogbookWorkspace = protectedPage(() => import('@/modules/logbooks/pages/LogbookWorkspace'));
const LogbookRegistry = protectedPage(() => import('@/modules/logbooks/pages/LogbookRegistry'));
const LogbookReview = protectedPage(() => import('@/modules/logbooks/pages/LogbookReview'));
const LogbookRecords = protectedPage(() => import('@/modules/logbooks/pages/LogbookRecords'));
const LogbookConnections = protectedPage(() => import('@/modules/logbooks/pages/LogbookConnections'));
const LogbookAssurance = protectedPage(() => import('@/modules/logbooks/pages/LogbookAssurance'));
const VesselDashboard = protectedPage(() => import('@/modules/vessels/pages/VesselDashboard'));
const CrewRoster = protectedPage(() => import('@/modules/crew/pages/CrewRoster'));
const Documents = protectedPage(() => import('@/modules/documents/pages/Documents'));
const Certificates = protectedPage(() => import('@/modules/certificates/pages/Certificates'));
const Incidents = protectedPage(() => import('@/modules/incidents/pages/Incidents'));
const Audits = protectedPage(() => import('@/modules/audits/pages/Audits'));
const Drills = protectedPage(() => import('@/modules/drills/pages/Drills'));
const DrillsAnnualGrid = protectedPage(() => import('@/modules/drills/pages/DrillsAnnualGrid'));
const Training = protectedPage(() => import('@/modules/training/pages/Training'));
const Maintenance = protectedPage(() => import('@/modules/maintenance/pages/Maintenance'));
const FleetMap = protectedPage(() => import('@/modules/dashboard/pages/FleetMap'));
const RiskAssessments = protectedPage(() => import('@/modules/risk-assessments/pages/RiskAssessments'));
const RiskAssessmentForm = protectedPage(() => import('@/modules/risk-assessments/pages/RiskAssessmentForm'));
const SafetyDocumentVersioning = protectedPage(() => import('@/modules/documents/pages/SafetyDocumentVersioning'));
const Settings = protectedPage(() => import('@/modules/settings/pages/Settings'));
const InsurancePage = protectedPage(() => import('@/modules/compliance/pages/InsurancePage'));
const HRPage = lazyPage(() => import('@/modules/compliance/pages/HRPage'), { guard: HrisGuard });
const HowToGuidesPage = protectedPage(() => import('@/modules/help/pages/HowToGuidesPage'));
const SupportPage = protectedPage(() => import('@/modules/help/pages/SupportPage'));
const PrivacyPolicyPage = protectedPage(() => import('@/modules/help/pages/PrivacyPolicyPage'));
const TermsOfServicePage = protectedPage(() => import('@/modules/help/pages/TermsOfServicePage'));

// Vessel pages. The two emergency routes keep separate page components, so
// moving between them remounts the page as it always has.
const CompanyDetails = protectedPage(() => import('@/modules/vessels/pages/CompanyDetails'));
const VesselEmergencyDetailsPage = protectedPage(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage'));
const VesselEmergencyByIdPage = protectedPage(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage'));

// ISM pages
const ERMPage = protectedPage(() => import('@/modules/ism/pages/ERMPage'));
const ChecklistsPage = protectedPage(() => import('@/modules/ism/pages/ChecklistsPage'));
const RiskAssessmentsPage = protectedPage(() => import('@/modules/ism/pages/RiskAssessmentsPage'));
const SOPsPage = protectedPage(() => import('@/modules/ism/pages/SOPsPage'));
const AuditsSurveysPage = protectedPage(() => import('@/modules/ism/pages/AuditsSurveysPage'));
const CorrectiveActionsPage = protectedPage(() => import('@/modules/ism/pages/CorrectiveActionsPage'));
const ISMDrillsPage = protectedPage(() => import('@/modules/ism/pages/DrillsPage'));
const ISMIncidentsPage = protectedPage(() => import('@/modules/ism/pages/IncidentsPage'));
const InvestigationsPage = protectedPage(() => import('@/modules/ism/pages/InvestigationsPage'));
const MeetingsPage = protectedPage(() => import('@/modules/ism/pages/MeetingsPage'));
const MiscellaneousPage = protectedPage(() => import('@/modules/ism/pages/MiscellaneousPage'));
const NonConformitiesPage = protectedPage(() => import('@/modules/ism/pages/NonConformitiesPage'));
const ObservationsPage = protectedPage(() => import('@/modules/ism/pages/ObservationsPage'));
const PermitsToWorkPage = protectedPage(() => import('@/modules/ism/pages/PermitsToWorkPage'));
const ISMTrainingPage = protectedPage(() => import('@/modules/ism/pages/TrainingPage'));

// ISM forms. Create/edit and new/view keep separate page components so each
// pair still remounts when the user moves from one to the other.
const FormTemplates = protectedPage(() => import('@/modules/ism/forms/pages/FormTemplates'));
const CreateTemplate = protectedPage(() => import('@/modules/ism/forms/pages/CreateTemplate'));
const EditTemplate = protectedPage(() => import('@/modules/ism/forms/pages/CreateTemplate'));
const TemplateDetail = protectedPage(() => import('@/modules/ism/forms/pages/TemplateDetail'));
const NewFormSubmission = protectedPage(() => import('@/modules/ism/forms/pages/FormSubmission'));
const ViewFormSubmission = protectedPage(() => import('@/modules/ism/forms/pages/FormSubmission'));
const SubmissionsList = protectedPage(() => import('@/modules/ism/forms/pages/SubmissionsList'));
const MyDrafts = protectedPage(() => import('@/modules/ism/forms/pages/MyDrafts'));
const PendingSignatures = protectedPage(() => import('@/modules/ism/forms/pages/PendingSignatures'));
const DraftTemplates = protectedPage(() => import('@/modules/ism/forms/pages/DraftTemplates'));
const FormsArchive = protectedPage(() => import('@/modules/ism/forms/pages/FormsArchive'));
const FormSchedules = protectedPage(() => import('@/modules/ism/forms/pages/FormSchedules'));
const FormExports = protectedPage(() => import('@/modules/ism/forms/pages/FormExports'));

// Document pages
const ReviewQueue = protectedPage(() => import('@/modules/documents/pages/ReviewQueue'));
const AcknowledgmentTracking = protectedPage(() => import('@/modules/crew/pages/AcknowledgmentTracking'));
const MasterDocumentIndex = protectedPage(() => import('@/modules/documents/pages/MasterDocumentIndex'));
const DocumentSearch = protectedPage(() => import('@/modules/documents/pages/DocumentSearch'));
const ReviewDashboard = protectedPage(() => import('@/modules/documents/pages/ReviewDashboard'));
const ISM_SMS = protectedPage(() => import('@/modules/documents/pages/ISM_SMS'));
const Drawings = protectedPage(() => import('@/modules/documents/pages/Drawings'));

// Report pages (heavy recharts dependency)
const IncidentAnalytics = protectedPage(() => import('@/modules/incidents/pages/IncidentAnalytics'));
const CAPATracker = protectedPage(() => import('@/modules/incidents/pages/CAPATracker'));
const DrillAnalytics = protectedPage(() => import('@/modules/drills/pages/DrillAnalytics'));
const CertificateAlerts = protectedPage(() => import('@/modules/certificates/pages/CertificateAlerts'));

// Settings and admin pages
const BrandingSettings = protectedPage(() => import('@/modules/settings/pages/BrandingSettings'));
const DPADashboard = protectedPage(() => import('@/modules/dashboard/pages/DPADashboard'));
const RolesPermissionsPage = protectedPage(() => import('@/modules/settings/pages/RolesPermissionsPage'), withShell);
const UsersAccessListPage = protectedPage(() => import('@/modules/users-access/pages/UsersAccessListPage'));
const UsersAccessDetailPage = protectedPage(() => import('@/modules/users-access/pages/UsersAccessDetailPage'));
const NotificationManagementPage = protectedPage(() => import('@/modules/notifications-admin/pages/NotificationManagementPage'));
const NotificationsPage = protectedPage(() => import('@/modules/notifications/pages/NotificationsPage'));
const InboxPage = protectedPage(() => import('@/modules/notifications/pages/InboxPage'));
// Honest "not built yet" page for admin areas whose previous pages showed sample data.
const ComingSoonPage = protectedPage(() => import('@/shared/pages/Placeholder'));
const APIIntegrations = protectedPage(() => import('@/modules/settings/pages/APIIntegrations'));
const FeedbackAdmin = protectedPage(() => import('@/modules/feedback/pages/FeedbackAdmin'), withShell);

// Crew pages. /crew/work-rest and /crew/work-rest/:crewId keep separate page
// components so moving between them remounts the month view as before.
const CrewList = protectedPage(() => import('@/modules/crew/pages/CrewList'));
const CrewDocuments = protectedPage(() => import('@/modules/crew/pages/CrewDocuments'));
const FlightsTravel = protectedPage(() => import('@/modules/crew/pages/FlightsTravel'));
const MyWorkRestMonth = protectedPage(() => import('@/modules/work-rest/pages/MyWorkRestMonth'));
const CrewWorkRestMonth = protectedPage(() => import('@/modules/work-rest/pages/MyWorkRestMonth'));
const WorkRestOverview = protectedPage(() => import('@/modules/work-rest/pages/WorkRestOverview'));
const VesselCalendar = protectedPage(() => import('@/modules/crew/pages/VesselCalendar'));
const CrewDashboard = protectedPage(() => import('@/modules/crew/pages/CrewDashboard'));
const LeavePlannerPage = protectedPage(() => import('@/modules/crew/pages/LeavePlannerPage'));
const LeaveRequestsPage = protectedPage(() => import('@/modules/crew/pages/LeaveRequestsPage'));
const LeaveCalculatorPage = protectedPage(() => import('@/modules/crew/pages/LeaveCalculatorPage'));
const RotationPlannerPage = protectedPage(() => import('@/modules/rotation-planner/pages/RotationPlannerPage'));
const CrewTasksPage = protectedPage(() => import('@/modules/crew/pages/CrewTasksPage'));
const DocumentAcknowledgementsPage = protectedPage(() => import('@/modules/crew/pages/DocumentAcknowledgementsPage'));

// Crew admin pages. Most of these do not render the shell themselves.
const CrewAdminDashboard = protectedPage(() => import('@/modules/crew/pages/admin/CrewAdminDashboard'), withShell);
const TravelRecordsPage = protectedPage(() => import('@/modules/crew/pages/admin/TravelRecordsPage'), withShell);
const CreateTravelRecordPage = protectedPage(() => import('@/modules/crew/pages/admin/CreateTravelRecordPage'), withShell);
const TravelRecordDetail = protectedPage(() => import('@/modules/crew/pages/admin/TravelRecordDetail'));
const PreDepartureListPage = protectedPage(() => import('@/modules/crew/pages/admin/PreDepartureListPage'), withShell);
const PreDepartureDetailPage = protectedPage(() => import('@/modules/crew/pages/admin/PreDepartureDetailPage'), withShell);
const TravelDocumentsPage = protectedPage(() => import('@/modules/crew/pages/admin/TravelDocumentsPage'), withShell);
const DocumentUploadPage = protectedPage(() => import('@/modules/crew/pages/admin/DocumentUploadPage'), withShell);
const QuarantineHousesPage = protectedPage(() => import('@/modules/crew/pages/admin/QuarantineHousesPage'), withShell);
const QuarantineBookingsPage = protectedPage(() => import('@/modules/crew/pages/admin/QuarantineBookingsPage'), withShell);
const AddQuarantineHousePage = protectedPage(() => import('@/modules/crew/pages/admin/AddQuarantineHousePage'), withShell);

// Certificate pages
const CrewCertificatesOverview = protectedPage(() => import('@/modules/certificates/pages/CrewCertificatesOverview'));

// Maintenance pages
const SpareParts = protectedPage(() => import('@/modules/maintenance/pages/SpareParts'));
const MaintenanceDefects = protectedPage(() => import('@/modules/maintenance/pages/MaintenanceDefects'));
const CriticalEquipment = protectedPage(() => import('@/modules/maintenance/pages/CriticalEquipment'));

// Itinerary pages
const FleetPlanningPage = protectedPage(() => import('@/modules/itinerary/pages/FleetPlanningPage'));
const FleetTimelinePage = protectedPage(() => import('@/modules/itinerary/pages/FleetTimelinePage'));
const TripSuggestionsPage = protectedPage(() => import('@/modules/itinerary/pages/TripSuggestionsPage'));
const PostponedEntriesPage = protectedPage(() => import('@/modules/itinerary/pages/PostponedEntriesPage'));

// Crew development pages
const MyDevelopment = protectedPage(() => import('@/modules/development/pages/MyDevelopment'));
const CourseCatalogue = protectedPage(() => import('@/modules/development/pages/CourseCatalogue'));
const DevelopmentApplications = protectedPage(() => import('@/modules/development/pages/DevelopmentApplications'));
const CoursesRegister = protectedPage(() => import('@/modules/development/pages/CoursesRegister'));
const CrewTraining = protectedPage(() => import('@/modules/development/pages/CrewTraining'));
const DevelopmentAdmin = protectedPage(() => import('@/modules/development/pages/DevelopmentAdmin'));

export const AppRoutes: React.FC = () => {
  return (
    <NavAccessProvider>
    <Routes>
      {/* Public Routes */}
      {/* Landing (gap/01): fleet users → /fleet/dashboard, vessel users → /v/<code>, others → /me. */}
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/index" element={<HomeRedirect />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<HomeRedirect />} />
      {/* Fleet reach goes to /fleet/dashboard; anyone else keeps the old page (D-27). */}
      <Route path="/dpa-dashboard" element={legacy('/dpa-dashboard', <DPADashboard />)} />

      {/* Fleet Map */}
      <Route path="/fleet-map" element={legacy('/fleet-map', <FleetMap />)} />

      {/* Legal (Help lives in the personal scope, below). */}
      <Route path="/legal/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/legal/terms-of-service" element={<TermsOfServicePage />} />

      {/* Electronic Logbooks */}
      <Route path="/vessel/logbooks" element={legacy('/vessel/logbooks', <LogbookWorkspace />)} />
      <Route path="/vessel/logbooks/list" element={<Navigate to="/vessel/logbooks" replace />} />
      <Route path="/vessel/logbooks/registry" element={legacy('/vessel/logbooks/registry', <LogbookRegistry />)} />
      <Route path="/vessel/logbooks/review" element={legacy('/vessel/logbooks/review', <LogbookReview />)} />
      <Route path="/vessel/logbooks/records" element={legacy('/vessel/logbooks/records', <LogbookRecords />)} />
      <Route path="/vessel/logbooks/connections" element={legacy('/vessel/logbooks/connections', <LogbookConnections />)} />
      <Route path="/vessel/logbooks/assurance" element={legacy('/vessel/logbooks/assurance', <LogbookAssurance />)} />
      <Route path="/vessel/logbooks/:logbookSlug" element={legacy('/vessel/logbooks/:logbookSlug', <LogbookWorkspace />)} />

      {/* Vessels */}
      <Route path="/vessels" element={<Navigate to="/vessels/dashboard" replace />} />
      <Route path="/vessels/list" element={legacy('/vessels/list', <Vessels />)} />
      <Route path="/vessels/dashboard" element={legacy('/vessels/dashboard', <VesselDashboard />)} />
      <Route path="/vessels/company-details" element={<CompanyDetails />} />
      <Route path="/vessels/emergency-details" element={legacy('/vessels/emergency-details', <VesselEmergencyDetailsPage />)} />
      <Route path="/vessels/:vesselId/emergency" element={legacy('/vessels/:vesselId/emergency', <VesselEmergencyByIdPage />)} />

      {/* Crew */}
      <Route path="/crew" element={legacy('/crew', <CrewRoster />)} />
      <Route path="/crew/roster" element={legacy('/crew/roster', <CrewRoster />)} />
      <Route path="/crew/list" element={legacy('/crew/list', <CrewList />)} />
      <Route path="/crew/certificates" element={legacy('/crew/certificates', <CrewDocuments />)} />
      <Route path="/crew/flights" element={<FlightsTravel />} />
      <Route path="/crew/hours-of-rest" element={legacy('/crew/hours-of-rest', <Navigate to="/crew/work-rest" replace />)} />
      <Route path="/crew/work-rest" element={legacy('/crew/work-rest', <MyWorkRestMonth />)} />
      <Route path="/crew/work-rest/overview" element={legacy('/crew/work-rest/overview', <WorkRestOverview />)} />
      <Route path="/crew/work-rest/:crewId" element={legacy('/crew/work-rest/:crewId', <CrewWorkRestMonth />)} />
      <Route path="/crew/calendar" element={legacy('/crew/calendar', <VesselCalendar />)} />
      <Route path="/crew/my-dashboard" element={<CrewDashboard />} />
      <Route path="/crew/leave" element={legacy('/crew/leave', <LeavePlannerPage />)} />
      <Route path="/crew/leave/requests" element={legacy('/crew/leave/requests', <LeaveRequestsPage />)} />
      <Route path="/crew/leave/calculator" element={<LeaveCalculatorPage />} />
      <Route path="/crew/rotation-planner" element={legacy('/crew/rotation-planner', <RotationPlannerPage />)} />
      <Route path="/crew/tasks" element={<CrewTasksPage />} />
      <Route path="/crew/acknowledgements" element={legacy('/crew/acknowledgements', <DocumentAcknowledgementsPage />)} />

      {/* Crew Admin */}
      <Route path="/crew/admin" element={<CrewAdminDashboard />} />
      <Route path="/crew/admin/travel" element={<TravelRecordsPage />} />
      <Route path="/crew/admin/travel/new" element={<CreateTravelRecordPage />} />
      <Route path="/crew/admin/travel/:id" element={<TravelRecordDetail />} />
      <Route path="/crew/admin/pre-departure" element={<PreDepartureListPage />} />
      <Route path="/crew/admin/pre-departure/:id" element={<PreDepartureDetailPage />} />
      <Route path="/crew/admin/documents" element={<TravelDocumentsPage />} />
      <Route path="/crew/admin/documents/upload" element={<DocumentUploadPage />} />
      <Route path="/crew/admin/quarantine" element={<QuarantineHousesPage />} />
      <Route path="/crew/admin/quarantine/bookings" element={<QuarantineBookingsPage />} />
      <Route path="/crew/admin/quarantine/new" element={<AddQuarantineHousePage />} />
      <Route path="/crew/admin/quarantine/:id" element={
        <ProtectedRoute>
          <DashboardLayout>
            <PlaceholderPage title="Quarantine House Details" icon={<Building2 />} description="View and manage quarantine house details, availability, and booking history." />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      {/* ISM - Parent redirect */}
      <Route path="/ism" element={<Navigate to="/ism/forms/templates" replace />} />

      {/* ISM - Forms */}
      <Route path="/ism/forms" element={<Navigate to="/ism/forms/templates" replace />} />
      <Route path="/ism/forms/templates" element={legacy('/ism/forms/templates', <FormTemplates />)} />
      <Route path="/ism/forms/templates/create" element={<CreateTemplate />} />
      <Route path="/ism/forms/templates/:templateId" element={<TemplateDetail />} />
      <Route path="/ism/forms/templates/:templateId/edit" element={<EditTemplate />} />
      <Route path="/ism/forms/new" element={<NewFormSubmission />} />
      <Route path="/ism/forms/submission/:submissionId" element={<ViewFormSubmission />} />
      <Route path="/ism/forms/submissions" element={<SubmissionsList />} />
      <Route path="/ism/forms/drafts" element={<DraftTemplates />} />
      <Route path="/ism/forms/my-drafts" element={<MyDrafts />} />
      <Route path="/ism/forms/pending" element={<PendingSignatures />} />
      <Route path="/ism/forms/archive" element={<FormsArchive />} />
      <Route path="/ism/forms/schedules" element={<FormSchedules />} />
      <Route path="/ism/forms/exports" element={<FormExports />} />

      {/* ISM - 15 Flat Routes (Alphabetical) */}
      <Route path="/ism/audits-surveys" element={<AuditsSurveysPage />} />
      <Route path="/ism/checklists" element={legacy('/ism/checklists', <ChecklistsPage />)} />
      <Route path="/ism/corrective-actions" element={<CorrectiveActionsPage />} />
      <Route path="/ism/drills" element={legacy('/ism/drills', <ISMDrillsPage />)} />
      <Route path="/ism/erm" element={legacy('/ism/erm', <ERMPage />)} />
      <Route path="/ism/incidents" element={<ISMIncidentsPage />} />
      <Route path="/ism/investigations" element={<InvestigationsPage />} />
      <Route path="/ism/meetings" element={<MeetingsPage />} />
      <Route path="/ism/miscellaneous" element={legacy('/ism/miscellaneous', <MiscellaneousPage />)} />
      <Route path="/ism/non-conformities" element={<NonConformitiesPage />} />
      <Route path="/ism/observations" element={<ObservationsPage />} />
      <Route path="/ism/permits-to-work" element={<PermitsToWorkPage />} />
      <Route path="/ism/risk-assessments" element={legacy('/ism/risk-assessments', <RiskAssessmentsPage />)} />
      <Route path="/ism/sops" element={<SOPsPage />} />
      <Route path="/ism/training" element={<ISMTrainingPage />} />

      {/* ISM - Legacy redirect */}
      <Route path="/ism/capa" element={<Navigate to="/ism/corrective-actions" replace />} />
      <Route path="/ism/audits" element={<Navigate to="/ism/audits-surveys" replace />} />

      {/* Certificates */}
      <Route path="/certificates" element={legacy('/certificates', <Certificates />)} />
      <Route path="/certificates/vessel" element={legacy('/certificates/vessel', <Certificates />)} />
      <Route path="/certificates/crew" element={<CrewCertificatesOverview />} />
      <Route path="/certificates/alerts" element={<CertificateAlerts />} />

      {/* Documents */}
      <Route path="/documents" element={legacy('/documents', <Documents />)} />
      {/* The Manuals, Procedures and Policies pages held sample data (gap/00
          K1): their URLs open the fleet register on that category. */}
      <Route path="/documents/manuals" element={<KeepSearchNavigate to="/fleet/documents/register?category=manuals" />} />
      <Route path="/documents/procedures" element={<KeepSearchNavigate to="/fleet/documents/register?category=procedures" />} />
      <Route path="/documents/ism-sms" element={<ISM_SMS />} />
      <Route path="/documents/policies" element={<KeepSearchNavigate to="/fleet/documents/register?category=policies" />} />
      <Route path="/documents/drawings" element={<Drawings />} />
      <Route path="/documents/search" element={<DocumentSearch />} />
      <Route path="/documents/master-index" element={<MasterDocumentIndex />} />
      <Route path="/documents/reviews" element={<ReviewDashboard />} />
      <Route path="/review-queue" element={<ReviewQueue />} />
      <Route path="/acknowledgments" element={legacy('/acknowledgments', <AcknowledgmentTracking />)} />

      {/* Itinerary */}
      <Route path="/itinerary" element={<Navigate to="/itinerary/planning" replace />} />
      <Route path="/itinerary/planning" element={<FleetPlanningPage />} />
      <Route path="/itinerary/timeline" element={legacy('/itinerary/timeline', <FleetTimelinePage />)} />
      <Route path="/itinerary/suggestions" element={<TripSuggestionsPage />} />
      <Route path="/itinerary/postponed" element={<PostponedEntriesPage />} />

      {/* Crew Development */}
      <Route path="/development" element={<Navigate to="/development/my" replace />} />
      <Route path="/development/my" element={legacy('/development/my', <MyDevelopment />)} />
      <Route path="/development/catalogue" element={legacy('/development/catalogue', <CourseCatalogue />)} />
      <Route path="/development/applications" element={legacy('/development/applications', <DevelopmentApplications />)} />
      <Route path="/development/courses-register" element={legacy('/development/courses-register', <CoursesRegister />)} />
      <Route path="/development/crew-training" element={legacy('/development/crew-training', <CrewTraining />)} />
      <Route path="/development/admin" element={legacy('/development/admin', <DevelopmentAdmin />)} />

      {/* HR */}
      <Route path="/hr" element={<HRPage />} />

      {/* Insurance */}
      <Route path="/insurance" element={<InsurancePage />} />

      {/* Maintenance */}
      <Route path="/maintenance" element={legacy('/maintenance', <Maintenance />)} />
      <Route path="/maintenance/dashboard" element={legacy('/maintenance/dashboard', <Maintenance />)} />
      <Route path="/maintenance/defects" element={<MaintenanceDefects />} />
      <Route path="/maintenance/critical" element={<CriticalEquipment />} />
      <Route path="/maintenance/spares" element={<SpareParts />} />

      {/* Alerts */}
      {/* The sample-data alerts page is gone; the notification centre reads the real alerts table. */}
      <Route path="/alerts" element={<Navigate to="/inbox?tab=attention" replace />} />

      {/* Settings */}
      <Route path="/settings" element={legacy('/settings', <Settings />)} />
      {/* A settings section opens its /me URL; any other /settings/… the profile.
          The static /settings/… routes below rank first (React Router). */}
      <Route path="/settings/:section" element={<SettingsSectionRedirect />} />
      <Route path="/settings/*" element={<KeepSearchNavigate to={PERSONAL_HOME} />} />
      <Route path="/settings/branding" element={<BrandingSettings />} />
      <Route path="/settings/permissions" element={legacy('/settings/permissions', <RolesPermissionsPage />)} />

      {/* Admin Routes */}
      <Route path="/admin" element={<Navigate to="/users-access" replace />} />
      {/* The localStorage-backed user list is gone; Users & Access is the real editor. */}
      <Route path="/admin/users" element={<Navigate to="/users-access" replace />} />
      <Route path="/users-access" element={legacy('/users-access', <UsersAccessListPage />)} />
      <Route path="/users-access/:userId" element={legacy('/users-access/:userId', <UsersAccessDetailPage />)} />
      <Route path="/settings/notifications" element={legacy('/settings/notifications', <NotificationManagementPage />)} />
      <Route path="/notifications" element={legacy('/notifications', <NotificationsPage />)} />
      {/* The old Notification Center is the inbox's Attention tab (D-62); its ?tab= becomes ?view=, the rest is kept. */}
      <Route path="/notifications/center" element={<NotificationCenterRedirect />} />
      <Route path="/admin/roles" element={legacy('/admin/roles', <RolesPermissionsPage />)} />
      <Route path="/admin/fleet-groups" element={<ComingSoonPage title="Fleet Groups" description="Grouping vessels into fleets is not built yet." />} />
      <Route path="/admin/alerts" element={<ComingSoonPage title="Alert Configuration" description="Alert rules and escalation settings are not built yet." />} />
      <Route path="/admin/integrations" element={<APIIntegrations />} />
      <Route path="/admin/feedback" element={<FeedbackAdmin />} />

      {/* Legacy/Report Routes */}
      <Route path="/drills" element={legacy('/drills', <Drills />)} />
      <Route path="/drills/annual-grid" element={<DrillsAnnualGrid />} />
      <Route path="/training" element={legacy('/training', <Training />)} />
      <Route path="/incidents" element={<Incidents />} />
      <Route path="/audits" element={<Audits />} />
      <Route path="/risk-assessments" element={legacy('/risk-assessments', <RiskAssessments />)} />
      <Route path="/risk-assessments/new" element={legacy('/risk-assessments/new', <RiskAssessmentForm />)} />
      <Route path="/documents/safety-versioning" element={<SafetyDocumentVersioning />} />
      <Route path="/settings/account-details" element={<Navigate to="/settings" replace />} />
      <Route path="/reports" element={legacy('/reports', <IncidentAnalytics />)} />
      <Route path="/reports/incident-analytics" element={legacy('/reports/incident-analytics', <IncidentAnalytics />)} />
      <Route path="/reports/capa-tracker" element={legacy('/reports/capa-tracker', <CAPATracker />)} />
      <Route path="/reports/drill-analytics" element={legacy('/reports/drill-analytics', <DrillAnalytics />)} />

      {/* Compliance — ISM / ISPS / MLC */}
      <Route path="/compliance" element={<CompliancePage />} />

      {/* Checklists — department-based */}
      <Route path="/checklists" element={legacy('/checklists', <NewChecklistsPage />)} />

      {/* Flights & Travel: the sample-data page is gone; the crew module's page reads flight_bookings. */}
      <Route path="/flights-travel" element={<Navigate to="/crew/flights" replace />} />

      {/* Individual Vessel Dashboards */}
      <Route path="/vessel/:vesselSlug/dashboard" element={legacy('/vessel/:vesselSlug/dashboard', <IndividualVesselDashboard />)} />
      <Route path="/vessel/:vesselSlug" element={legacy('/vessel/:vesselSlug', <IndividualVesselDashboard />)} />
      {/* Convenience routes for all 7 vessels */}
      <Route path="/vessel/:vesselSlug/checklists" element={legacy('/vessel/:vesselSlug/checklists', <NewChecklistsPage />)} />
      <Route path="/vessel/:vesselSlug/compliance" element={<CompliancePage />} />
      <Route path="/vessel/:vesselSlug/compliance/ism" element={<CompliancePage />} />
      <Route path="/vessel/:vesselSlug/compliance/isps" element={<CompliancePage />} />
      <Route path="/vessel/:vesselSlug/compliance/mlc" element={<CompliancePage />} />

      {/* The seed-data permission matrix is gone; Users & Access edits real permissions. */}
      <Route path="/settings/user-permissions" element={<Navigate to="/users-access" replace />} />

      {/* ── Scopes (BUILD-PLAN B5; gap/00 B2–B3; gap/01 F14; D-02, D-13) ──
          Each scope renders the shell once around its pages. The pages are the
          existing components, mounted unchanged: a page that still renders
          DashboardLayout itself gets the idempotent one. Old URLs redirect here
          through LegacyRoute (src/app/router/legacyRedirects.ts). */}

      {/* Fleet view: oversight across every vessel the user can reach. The
          dashboard, reports overview, documents, training and planner pages
          are module routes (fleetManifestRoutes, below). */}
      <Route path="/fleet" element={<FleetScope />}>
        <Route index element={<KeepSearchNavigate to="/fleet/dashboard" />} />
        <Route path="tracker" element={<FleetMap />} />
        <Route path="calendar" element={<FleetTimelinePage />} />
        {/* The four legacy report pages the reports overview links. */}
        <Route path="reports/incident-analytics" element={<IncidentAnalytics />} />
        <Route path="reports/capa-tracker" element={<CAPATracker />} />
        <Route path="reports/drill-analytics" element={<DrillAnalytics />} />
        <Route path="reports/risk-overview" element={<ERMPage />} />
        <Route path="admin" element={<KeepSearchNavigate to="/fleet/admin/users/crew" />} />
        <Route path="admin/users" element={<KeepSearchNavigate to="/fleet/admin/users/crew" />} />
        <Route path="admin/users/crew" element={<UsersAccessListPage />} />
        <Route path="admin/users/people/:userId" element={<UsersAccessDetailPage />} />
        <Route path="admin/users/sets" element={<RolesPermissionsPage />} />
        <Route path="admin/vessels" element={<Vessels />} />
        <Route path="admin/notifications" element={<NotificationManagementPage />} />
        {/* Fleet routes registered by module manifests (B8). */}
        {fleetManifestRoutes}
        {/* Planned Fleet leaves: Coming Soon inside the scope (sitemap, D-06). */}
        {fleetNavRoutes}
        <Route path="*" element={<ScopeNotFound />} />
      </Route>

      {/* Vessel view: one vessel, named by its code in the URL (D-03, C20).
          The Crew tab's pages are module routes (the crew and development
          manifests; vesselManifestRoutes, below). */}
      <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
        <Route index element={<VesselDashboard />} />
        <Route path="safety/drills" element={<ISMDrillsPage />} />
        <Route path="safety/forms" element={<MiscellaneousPage />} />
        <Route path="safety/checklists" element={<ChecklistsPage />} />
        <Route path="safety/risk-assessments" element={<RiskAssessmentsPage />} />
        <Route path="safety/risk-assessments/new" element={<RiskAssessmentForm />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="technical" element={<Maintenance />} />
        <Route path="vessel/emergency" element={<VesselEmergencyDetailsPage />} />
        <Route path="logbooks" element={<LogbookWorkspace />} />
        <Route path="logbooks/registry" element={<LogbookRegistry />} />
        <Route path="logbooks/review" element={<LogbookReview />} />
        <Route path="logbooks/records" element={<LogbookRecords />} />
        <Route path="logbooks/connections" element={<LogbookConnections />} />
        <Route path="logbooks/assurance" element={<LogbookAssurance />} />
        <Route path="logbooks/:logbookSlug" element={<LogbookWorkspace />} />
        <Route path="calendar" element={<VesselCalendar />} />
        {/* Vessel routes registered by module manifests (B8), relative to the vessel. */}
        {vesselManifestRoutes}
        {/* Module roots with no page of their own (crew, safety, vessel, …)
            open their first leaf; planned vessel leaves open Coming Soon
            (sitemap VESSEL_MODULES, D-06). */}
        {vesselNavRoutes}
        <Route path="*" element={<ScopeNotFound />} />
      </Route>

      {/* Personal area (spec §8): one shell (scope personal) around /me/*,
          /inbox and /help/*. Every settings section has its own URL; /me and
          the old ?tab= form redirect (src/app/router/personalRoutes.tsx). */}
      <Route element={<PersonalScope />}>
        <Route path="/me">
          <Route index element={<PersonalIndexRedirect />} />
          {PERSONAL_SETTINGS_ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={<Settings section={route.section} />} />
          ))}
          <Route path="hours-of-rest" element={<MyWorkRestMonth />} />
          {/* Absolute, as the HRIS Training & Development leaf links it, so
              the route-literal checks (src/test/hris/wiring.test.ts) find it. */}
          <Route path="/me/training" element={<MyDevelopment />} />
          <Route path="notifications" element={<NotificationsPage />} />
          {/* Personal routes registered by module manifests (B8). */}
          {personalManifestRoutes}
          {/* Planned personal leaves: Coming Soon inside the scope (sitemap, D-06). */}
          {personalNavRoutes}
          {/* Support is the Help page (/help/support); the old section URL and
              ?tab=support land there with the query kept. */}
          <Route path="support" element={<KeepSearchNavigate to="/help/support" />} />
          <Route path="*" element={<KeepSearchNavigate to={PERSONAL_HOME} />} />
        </Route>
        {/* The inbox the bell opens (gap/10 /inbox, P5): All / Attention / Archived;
            /notifications/center redirects to its Attention tab (D-62). */}
        <Route path={INBOX_PATH} element={<InboxPage />} />
        {/* Help (gap/10 Target IA principle 1: Personal = /me, /inbox, /help).
            The URLs are the ones the Help menu, the footer and the Coming
            Soon pages link; /help/support is the one Support page (/me/support
            redirects to it) and takes ?subject= (D-87), which the redirects
            keep (D-43). */}
        <Route path="/help" element={<KeepSearchNavigate to="/help/how-to-guides" />} />
        <Route path="/help/how-to-guides" element={<HowToGuidesPage />} />
        <Route path="/help/support" element={<SupportPage />} />
        {/* Any other /inbox or /help URL is the in-scope 404 (D-96), as in the
            Fleet and vessel scopes, never a jump to the Fleet dashboard. The
            static routes above outrank these splats. The planned gap/10 Help
            URLs (/help/faqs/:id, /help/requests…) get sitemap placeholders
            when those leaves are added. */}
        <Route path={`${INBOX_PATH}/*`} element={<ScopeNotFound />} />
        <Route path="/help/*" element={<ScopeNotFound />} />
      </Route>

      {/* Workspaces keep their URLs, guards and module shells (D-09). Their
          routes come from the module manifests (src/modules/<m>/module.ts,
          BUILD-PLAN B8): HRIS, Health & Wellness, Yard (Refit, New Build)
          and Legal, each inside one WorkspaceScope, so the shell is mounted
          once per workspace. Placeholders exist only for planned leaves, so
          no real page depends on route order. */}
      {workspaceManifestRoutes}

      {/* Coming Soon URLs the old Fleet and Vessel trees made up, retired by
          the target nav tree (B7): each goes to its replacement for one release. */}
      {retiredNavRoutes}

      {/* Sitemap-driven placeholders: every planned Shoreside/Health/Yard/HRIS
          leaf (no real page yet) renders a Coming Soon screen, so bookmarks
          resolve while the sidebar hides the leaf (D-06). Live leaves never
          get one. Fleet and vessel placeholders sit inside their scopes, and
          a workspace's inside its WorkspaceScope (manifestRoutes.tsx); only
          those of a workspace with no scope route (Shoreside) are here. */}
      {TOP_LEVEL_PLACEHOLDER_LEAVES.map((leaf) => (
        <Route key={leaf.path} path={leaf.path} element={placeholderElement(leaf, false)} />
      ))}

      {/* Section and group paths (e.g. /hris, /hris/compensation) redirect to
          their first leaf so bookmarks don't bounce to the dashboard. The
          query and hash are kept; the target's own ?module= wins. */}
      {SECTION_REDIRECTS.map((redirect) => (
        <Route key={redirect.from} path={redirect.from} element={<KeepSearchNavigate to={redirect.to} />} />
      ))}

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </NavAccessProvider>
  );
};

export default AppRoutes;
