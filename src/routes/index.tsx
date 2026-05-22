import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';
import { 
  Ship, Users, Award, Plane, Clock, CalendarDays,
  AlertTriangle, ClipboardList, BookOpen, Shield, FileCheck, Layers, LayoutGrid,
  Package, Bell, Settings as SettingsIcon, Building2, Phone, Wrench, FileText, Calendar,
  Compass
} from 'lucide-react';

// Main Pages - Keep critical path pages sync, lazy load the rest
import Index from '@/shared/pages/Index';
import Auth from '@/modules/auth/pages/Auth';
import ResetPassword from '@/modules/auth/pages/ResetPassword';
import Dashboard from '@/modules/dashboard/pages/Dashboard';

// New module pages - lazy loaded
const CompliancePage = React.lazy(() => import('@/modules/compliance/pages/CompliancePage'));
const NewChecklistsPage = React.lazy(() => import('@/modules/ism/pages/ChecklistsPage'));
const FlightsTravelPage = React.lazy(() => import('@/modules/flights/pages/FlightsTravelPage'));
const IndividualVesselDashboard = React.lazy(() => import('@/modules/vessels/pages/IndividualVesselDashboard'));
const NewPermissionsPage = React.lazy(() => import('@/modules/settings/pages/PermissionsPage'));

// Lazy loaded pages
const Vessels = React.lazy(() => import('@/modules/vessels/pages/Vessels'));
const VesselDashboard = React.lazy(() => import('@/modules/vessels/pages/VesselDashboard'));
const CrewRoster = React.lazy(() => import('@/modules/crew/pages/CrewRoster'));
const Documents = React.lazy(() => import('@/modules/documents/pages/Documents'));
const Certificates = React.lazy(() => import('@/modules/certificates/pages/Certificates'));
const Incidents = React.lazy(() => import('@/modules/incidents/pages/Incidents'));
const Audits = React.lazy(() => import('@/modules/audits/pages/Audits'));
const Drills = React.lazy(() => import('@/modules/drills/pages/Drills'));
const Training = React.lazy(() => import('@/modules/training/pages/Training'));
const Maintenance = React.lazy(() => import('@/modules/maintenance/pages/Maintenance'));
const FleetMap = React.lazy(() => import('@/modules/dashboard/pages/FleetMap'));
const RiskAssessments = React.lazy(() => import('@/modules/risk-assessments/pages/RiskAssessments'));
const Alerts = React.lazy(() => import('@/modules/alerts/pages/Alerts'));
const Settings = React.lazy(() => import('@/modules/settings/pages/Settings'));
const NotFound = React.lazy(() => import('@/shared/pages/NotFound'));
const InsurancePage = React.lazy(() => import('@/modules/compliance/pages/InsurancePage'));
const HRPage = React.lazy(() => import('@/modules/compliance/pages/HRPage'));

// ISM Pages - Lazy loaded for better code splitting
const ERMPage = React.lazy(() => import('@/modules/ism/pages/ERMPage'));
const ChecklistsPage = React.lazy(() => import('@/modules/ism/pages/ChecklistsPage'));
const RiskAssessmentsPage = React.lazy(() => import('@/modules/ism/pages/RiskAssessmentsPage'));
const SOPsPage = React.lazy(() => import('@/modules/ism/pages/SOPsPage'));
const AuditsSurveysPage = React.lazy(() => import('@/modules/ism/pages/AuditsSurveysPage'));
const CorrectiveActionsPage = React.lazy(() => import('@/modules/ism/pages/CorrectiveActionsPage'));
const ISMDrillsPage = React.lazy(() => import('@/modules/ism/pages/DrillsPage'));
const ISMIncidentsPage = React.lazy(() => import('@/modules/ism/pages/IncidentsPage'));
const InvestigationsPage = React.lazy(() => import('@/modules/ism/pages/InvestigationsPage'));
const MeetingsPage = React.lazy(() => import('@/modules/ism/pages/MeetingsPage'));
const MiscellaneousPage = React.lazy(() => import('@/modules/ism/pages/MiscellaneousPage'));
const NonConformitiesPage = React.lazy(() => import('@/modules/ism/pages/NonConformitiesPage'));
const ObservationsPage = React.lazy(() => import('@/modules/ism/pages/ObservationsPage'));
const PermitsToWorkPage = React.lazy(() => import('@/modules/ism/pages/PermitsToWorkPage'));
const ISMTrainingPage = React.lazy(() => import('@/modules/ism/pages/TrainingPage'));

// Document Sub-pages - lazy loaded
const ReviewQueue = React.lazy(() => import('@/modules/documents/pages/ReviewQueue'));
const AcknowledgmentTracking = React.lazy(() => import('@/modules/crew/pages/AcknowledgmentTracking'));
const MasterDocumentIndex = React.lazy(() => import('@/modules/documents/pages/MasterDocumentIndex'));
const DocumentSearch = React.lazy(() => import('@/modules/documents/pages/DocumentSearch'));
const ReviewDashboard = React.lazy(() => import('@/modules/documents/pages/ReviewDashboard'));

// Report Pages - lazy loaded (heavy recharts dependency)
const IncidentAnalytics = React.lazy(() => import('@/modules/incidents/pages/IncidentAnalytics'));
const CAPATracker = React.lazy(() => import('@/modules/incidents/pages/CAPATracker'));
const DrillAnalytics = React.lazy(() => import('@/modules/drills/pages/DrillAnalytics'));
const CertificateAlerts = React.lazy(() => import('@/modules/certificates/pages/CertificateAlerts'));

// Settings Sub-pages - lazy loaded
const BrandingSettings = React.lazy(() => import('@/modules/settings/pages/BrandingSettings'));
const DPADashboard = React.lazy(() => import('@/modules/dashboard/pages/DPADashboard'));
const RolesPermissionsPage = React.lazy(() => import('@/modules/settings/pages/RolesPermissionsPage'));

// Admin Pages - lazy loaded
const UserManagement = React.lazy(() => import('@/modules/settings/pages/UserManagement'));
const FleetGroups = React.lazy(() => import('@/modules/settings/pages/FleetGroups'));
const AlertConfiguration = React.lazy(() => import('@/modules/settings/pages/AlertConfiguration'));
const APIIntegrations = React.lazy(() => import('@/modules/settings/pages/APIIntegrations'));
const FeedbackAdmin = React.lazy(() => import('@/modules/feedback/pages/FeedbackAdmin'));

// Document Pages - lazy loaded
const Manuals = React.lazy(() => import('@/modules/documents/pages/Manuals'));
const Policies = React.lazy(() => import('@/modules/documents/pages/Policies'));
const Procedures = React.lazy(() => import('@/modules/documents/pages/Procedures'));
const ISM_SMS = React.lazy(() => import('@/modules/documents/pages/ISM_SMS'));
const Drawings = React.lazy(() => import('@/modules/documents/pages/Drawings'));

// Crew Pages - lazy loaded
const FlightsTravel = React.lazy(() => import('@/modules/crew/pages/FlightsTravel'));
const LeavePlannerPage = React.lazy(() => import('@/modules/crew/pages/LeavePlannerPage'));
const LeaveRequestsPage = React.lazy(() => import('@/modules/crew/pages/LeaveRequestsPage'));
const LeaveCalculatorPage = React.lazy(() => import('@/modules/crew/pages/LeaveCalculatorPage'));
const TravelRecordDetail = React.lazy(() => import('@/modules/crew/pages/admin/TravelRecordDetail'));
const QuarantineBookingsPage = React.lazy(() => import('@/modules/crew/pages/admin/QuarantineBookingsPage'));

// Certificate Pages - lazy loaded
const CrewCertificatesOverview = React.lazy(() => import('@/modules/certificates/pages/CrewCertificatesOverview'));

// ISM Forms Pages - lazy loaded
const DraftTemplates = React.lazy(() => import('@/modules/ism/forms/pages/DraftTemplates'));
const FormsArchive = React.lazy(() => import('@/modules/ism/forms/pages/FormsArchive'));
const FormSchedules = React.lazy(() => import('@/modules/ism/forms/pages/FormSchedules'));
const FormExports = React.lazy(() => import('@/modules/ism/forms/pages/FormExports'));

// Maintenance Pages - lazy loaded
const SpareParts = React.lazy(() => import('@/modules/maintenance/pages/SpareParts'));

// Maintenance Pages - lazy loaded
const MaintenanceDefects = React.lazy(() => import('@/modules/maintenance/pages/MaintenanceDefects'));
const CriticalEquipment = React.lazy(() => import('@/modules/maintenance/pages/CriticalEquipment'));

// Vessel Pages - lazy loaded
const CompanyDetails = React.lazy(() => import('@/modules/vessels/pages/CompanyDetails'));

// Loading spinner for lazy components
const LazyLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// Placeholder wrapper with layout
const PlaceholderWrapper: React.FC<{ 
  title: string; 
  description?: string;
  features?: string[];
  icon?: React.ReactNode;
}> = ({ title, description, features, icon }) => (
  <DashboardLayout>
    <PlaceholderPage 
      title={title} 
      description={description}
      features={features} 
      icon={icon}
      expectedRelease="Phase 2" 
    />
  </DashboardLayout>
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dpa-dashboard" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><DPADashboard /></React.Suspense></ProtectedRoute>} />

      {/* Fleet Map */}
      <Route path="/fleet-map" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><FleetMap /></React.Suspense></ProtectedRoute>} />

      {/* Vessels */}
      <Route path="/vessels" element={<Navigate to="/vessels/dashboard" replace />} />
      <Route path="/vessels/list" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Vessels /></React.Suspense></ProtectedRoute>} />
      <Route path="/vessels/dashboard" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><VesselDashboard /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessels/company-details" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompanyDetails /></React.Suspense></ProtectedRoute>} />
      <Route path="/vessels/emergency-details" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessels/:vesselId/emergency" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Crew */}
      <Route path="/crew" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CrewRoster /></React.Suspense></ProtectedRoute>} />
      <Route path="/crew/roster" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CrewRoster /></React.Suspense></ProtectedRoute>} />
      <Route path="/crew/certificates" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/CrewDocuments')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/flights" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><FlightsTravel /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/hours-of-rest" element={<Navigate to="/crew/work-rest" replace />} />
      <Route path="/crew/work-rest" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/work-rest/pages/MyWorkRestMonth')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/work-rest/overview" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/work-rest/pages/WorkRestOverview')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/work-rest/:crewId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/work-rest/pages/MyWorkRestMonth')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/calendar" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/VesselCalendar')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/my-dashboard" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/CrewDashboard')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/leave" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><LeavePlannerPage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/leave/requests" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><LeaveRequestsPage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/leave/calculator" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><LeaveCalculatorPage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/tasks" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/CrewTasksPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/acknowledgements" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/DocumentAcknowledgementsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Crew Admin */}
      <Route path="/crew/admin" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/CrewAdminDashboard')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/travel" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/TravelRecordsPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/travel/new" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/CreateTravelRecordPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/travel/:id" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><TravelRecordDetail /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/pre-departure" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/PreDepartureListPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/pre-departure/:id" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/PreDepartureDetailPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/documents" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/TravelDocumentsPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/documents/upload" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/DocumentUploadPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/quarantine" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/QuarantineHousesPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/quarantine/bookings" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/QuarantineBookingsPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/quarantine/new" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}>
              {React.createElement(React.lazy(() => import('@/modules/crew/pages/admin/AddQuarantineHousePage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
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
      <Route path="/ism/forms/templates" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/FormTemplates')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/templates/create" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/CreateTemplate')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/templates/:templateId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/TemplateDetail')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/templates/:templateId/edit" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/CreateTemplate')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/new" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/FormSubmission')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/submission/:submissionId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/FormSubmission')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/submissions" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/SubmissionsList')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/drafts" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><DraftTemplates /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/my-drafts" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/MyDrafts')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/pending" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/PendingSignatures')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/archive" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><FormsArchive /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/schedules" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><FormSchedules /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/exports" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><FormExports /></React.Suspense>
        </ProtectedRoute>
      } />
      
      {/* ISM - 15 Flat Routes (Alphabetical) - All lazy loaded */}
      <Route path="/ism/audits-surveys" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><AuditsSurveysPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/checklists" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><ChecklistsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/corrective-actions" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><CorrectiveActionsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/drills" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><ISMDrillsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/erm" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><ERMPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/incidents" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><ISMIncidentsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/investigations" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><InvestigationsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/meetings" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><MeetingsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/miscellaneous" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><MiscellaneousPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/non-conformities" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><NonConformitiesPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/observations" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><ObservationsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/permits-to-work" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><PermitsToWorkPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/risk-assessments" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><RiskAssessmentsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/sops" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><SOPsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/ism/training" element={<ProtectedRoute><React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}><ISMTrainingPage /></React.Suspense></ProtectedRoute>} />

      {/* ISM - Legacy redirect */}
      <Route path="/ism/capa" element={<Navigate to="/ism/corrective-actions" replace />} />
      <Route path="/ism/audits" element={<Navigate to="/ism/audits-surveys" replace />} />

      {/* Certificates */}
      <Route path="/certificates" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Certificates /></React.Suspense></ProtectedRoute>} />
      <Route path="/certificates/vessel" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Certificates /></React.Suspense></ProtectedRoute>} />
      <Route path="/certificates/crew" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CrewCertificatesOverview /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/certificates/alerts" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <CertificateAlerts />
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Documents */}
      <Route path="/documents" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Documents /></React.Suspense></ProtectedRoute>} />
      <Route path="/documents/manuals" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Manuals /></React.Suspense></ProtectedRoute>} />
      <Route path="/documents/procedures" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/documents/pages/Procedures')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/documents/ism-sms" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><ISM_SMS /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/documents/policies" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Policies /></React.Suspense></ProtectedRoute>} />
      <Route path="/documents/drawings" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><Drawings /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/documents/search" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><DocumentSearch /></React.Suspense></ProtectedRoute>} />
      <Route path="/documents/master-index" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><MasterDocumentIndex /></React.Suspense></ProtectedRoute>} />
      <Route path="/documents/reviews" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ReviewDashboard /></React.Suspense></ProtectedRoute>} />
      <Route path="/review-queue" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ReviewQueue /></React.Suspense></ProtectedRoute>} />
      <Route path="/acknowledgments" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><AcknowledgmentTracking /></React.Suspense></ProtectedRoute>} />

      {/* Itinerary */}
      <Route path="/itinerary" element={<Navigate to="/itinerary/planning" replace />} />
      <Route path="/itinerary/planning" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/FleetPlanningPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/itinerary/timeline" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/FleetTimelinePage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/itinerary/suggestions" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/TripSuggestionsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/itinerary/postponed" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/PostponedEntriesPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Crew Development */}
      <Route path="/development" element={<Navigate to="/development/my" replace />} />
      <Route path="/development/my" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/MyDevelopment')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/development/catalogue" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/CourseCatalogue')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/development/applications" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/DevelopmentApplications')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/development/admin" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/DevelopmentAdmin')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* HR */}
      <Route path="/hr" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><HRPage /></React.Suspense></ProtectedRoute>} />

      {/* Insurance */}
      <Route path="/insurance" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><InsurancePage /></React.Suspense></ProtectedRoute>} />

      {/* Maintenance */}
      <Route path="/maintenance" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Maintenance /></React.Suspense></ProtectedRoute>} />
      <Route path="/maintenance/dashboard" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Maintenance /></React.Suspense></ProtectedRoute>} />
      <Route path="/maintenance/defects" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><MaintenanceDefects /></React.Suspense></ProtectedRoute>} />
      <Route path="/maintenance/critical" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CriticalEquipment /></React.Suspense></ProtectedRoute>} />
      <Route path="/maintenance/spares" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><SpareParts /></React.Suspense>
        </ProtectedRoute>
      } />

      {/* Alerts */}
      <Route path="/alerts" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Alerts /></React.Suspense></ProtectedRoute>} />

      {/* Settings */}
      <Route path="/settings" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Settings /></React.Suspense></ProtectedRoute>} />
      <Route path="/settings/*" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Settings /></React.Suspense></ProtectedRoute>} />
      <Route path="/settings/branding" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><BrandingSettings /></React.Suspense></ProtectedRoute>} />
      <Route path="/settings/permissions" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}><RolesPermissionsPage /></React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
      <Route path="/admin/users" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><UserManagement /></React.Suspense></ProtectedRoute>} />
      <Route path="/admin/roles" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}><RolesPermissionsPage /></React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/fleet-groups" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><FleetGroups /></React.Suspense></ProtectedRoute>} />
      <Route path="/admin/alerts" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><AlertConfiguration /></React.Suspense></ProtectedRoute>} />
      <Route path="/admin/integrations" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><APIIntegrations /></React.Suspense></ProtectedRoute>} />
      <Route path="/admin/feedback" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}><FeedbackAdmin /></React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Legacy/Report Routes */}
      <Route path="/drills" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Drills /></React.Suspense></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Training /></React.Suspense></ProtectedRoute>} />
      <Route path="/incidents" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Incidents /></React.Suspense></ProtectedRoute>} />
      <Route path="/audits" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Audits /></React.Suspense></ProtectedRoute>} />
      <Route path="/risk-assessments" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><RiskAssessments /></React.Suspense></ProtectedRoute>} />
      <Route path="/reports" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <IncidentAnalytics />
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/reports/incident-analytics" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <IncidentAnalytics />
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/reports/capa-tracker" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <CAPATracker />
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/reports/drill-analytics" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <DrillAnalytics />
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Compliance — ISM / ISPS / MLC */}
      <Route path="/compliance" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense>
        </ProtectedRoute>
      } />

      {/* Checklists — department-based */}
      <Route path="/checklists" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><NewChecklistsPage /></React.Suspense>
        </ProtectedRoute>
      } />

      {/* Flights & Travel */}
      <Route path="/flights-travel" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><FlightsTravelPage /></React.Suspense>
        </ProtectedRoute>
      } />

      {/* Individual Vessel Dashboards */}
      <Route path="/vessel/:vesselSlug/dashboard" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><IndividualVesselDashboard /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessel/:vesselSlug" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><IndividualVesselDashboard /></React.Suspense>
        </ProtectedRoute>
      } />
      {/* Convenience routes for all 7 vessels */}
      <Route path="/vessel/:vesselSlug/checklists" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><NewChecklistsPage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessel/:vesselSlug/compliance" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessel/:vesselSlug/compliance/ism" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessel/:vesselSlug/compliance/isps" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessel/:vesselSlug/compliance/mlc" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense>
        </ProtectedRoute>
      } />

      {/* Permissions (user-based toggle matrix) */}
      <Route path="/settings/user-permissions" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><NewPermissionsPage /></React.Suspense>
        </ProtectedRoute>
      } />

      {/* ================================================================
          NEW IA — Canonical routes (Phase 1). The sidebar + SmartTabBar
          link here; the legacy paths above continue to work for bookmarks.
          ================================================================ */}

      {/* Home */}
      <Route path="/home" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/home/dpa" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><DPADashboard /></React.Suspense></ProtectedRoute>} />
      <Route path="/home/my" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/CrewDashboard')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/home/approvals" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ReviewDashboard /></React.Suspense></ProtectedRoute>} />
      <Route path="/home/alerts" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Alerts /></React.Suspense></ProtectedRoute>} />

      {/* Operations */}
      <Route path="/operations/map" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><FleetMap /></React.Suspense></ProtectedRoute>} />
      <Route path="/operations/itinerary" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/FleetPlanningPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/operations/voyage-planning" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/FleetPlanningPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/operations/fleet-timeline" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/FleetTimelinePage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/operations/postponed" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/PostponedEntriesPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/operations/vessels/:vesselSlug" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><IndividualVesselDashboard /></React.Suspense></ProtectedRoute>} />
      <Route path="/operations/vessels/:vesselSlug/dashboard" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><IndividualVesselDashboard /></React.Suspense></ProtectedRoute>} />
      <Route path="/operations/vessels/:vesselSlug/checklists" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><NewChecklistsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/operations/vessels/:vesselSlug/compliance" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense></ProtectedRoute>} />
      <Route path="/operations/vessels/:vesselSlug/compliance/:section" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense></ProtectedRoute>} />
      {/* Operations placeholders (phase 2) */}
      <Route path="/operations/port-calls" element={<PlaceholderWrapper title="Port Calls" />} />
      <Route path="/operations/weather" element={<PlaceholderWrapper title="Weather" />} />
      <Route path="/operations/fuel" element={<PlaceholderWrapper title="Fuel & Consumption" />} />
      <Route path="/operations/guest-movements" element={<PlaceholderWrapper title="Guest Movements" />} />
      <Route path="/operations/flight-tracking" element={<PlaceholderWrapper title="Flight Tracking" />} />
      <Route path="/operations/logistics" element={<PlaceholderWrapper title="Logistics" />} />

      {/* Crew */}
      <Route path="/crew/list" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CrewRoster /></React.Suspense></ProtectedRoute>} />
      <Route path="/crew/hours-of-rest/overview" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/work-rest/pages/WorkRestOverview')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/hours-of-rest/:crewId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/work-rest/pages/MyWorkRestMonth')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/leave/calendar" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/crew/pages/VesselCalendar')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/training" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/MyDevelopment')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/training/catalogue" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/CourseCatalogue')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/training/applications" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/DevelopmentApplications')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/travel-visa" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><FlightsTravelPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/crew/travel-visa/flights" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><FlightsTravel /></React.Suspense></ProtectedRoute>} />
      {/* Crew placeholders (phase 2) */}
      <Route path="/crew/performance" element={<PlaceholderWrapper title="Crew Performance" />} />
      <Route path="/crew/medical" element={<PlaceholderWrapper title="Crew Medical" />} />
      <Route path="/crew/recruitment" element={<PlaceholderWrapper title="Crew Recruitment" />} />
      <Route path="/crew/welfare" element={<PlaceholderWrapper title="Crew Welfare" />} />

      {/* Compliance — new canonical paths render existing pages */}
      <Route path="/compliance/ism" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/isps" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/mlc" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompliancePage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/audits" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><AuditsSurveysPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/non-conformities" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><NonConformitiesPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/non-conformities/capa" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CorrectiveActionsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/risk-assessments" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><RiskAssessmentsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/drills" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ISMDrillsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/incidents" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ISMIncidentsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/incidents/investigations" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><InvestigationsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/safety-meetings" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><MeetingsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/permits" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><PermitsToWorkPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/checklists" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><NewChecklistsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/insurance" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><InsurancePage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/other-ism" element={<Navigate to="/compliance/other-ism/observations" replace />} />
      <Route path="/compliance/other-ism/observations" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ObservationsPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/other-ism/erm" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ERMPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/other-ism/miscellaneous" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><MiscellaneousPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/compliance/marpol" element={<PlaceholderWrapper title="MARPOL" />} />

      {/* Technical */}
      <Route path="/technical/planned-maintenance" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Maintenance /></React.Suspense></ProtectedRoute>} />
      <Route path="/technical/defects" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><MaintenanceDefects /></React.Suspense></ProtectedRoute>} />
      <Route path="/technical/critical-equipment" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CriticalEquipment /></React.Suspense></ProtectedRoute>} />
      <Route path="/technical/inventory" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><SpareParts /></React.Suspense></ProtectedRoute>} />
      <Route path="/technical/certificates" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Certificates /></React.Suspense></ProtectedRoute>} />
      <Route path="/technical/certificates/alerts" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CertificateAlerts /></React.Suspense></ProtectedRoute>} />
      <Route path="/technical/drawings" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Drawings /></React.Suspense></ProtectedRoute>} />
      {/* Technical placeholders (phase 2) */}
      <Route path="/technical/work-orders" element={<PlaceholderWrapper title="Work Orders" />} />
      <Route path="/technical/service-reports" element={<PlaceholderWrapper title="Service Reports" />} />
      <Route path="/technical/class-conditions" element={<PlaceholderWrapper title="Class Conditions" />} />
      <Route path="/technical/refit" element={<PlaceholderWrapper title="Refit & Dry Dock" />} />
      <Route path="/technical/contractors" element={<PlaceholderWrapper title="Contractors" />} />
      <Route path="/technical/projects" element={<PlaceholderWrapper title="Technical Projects" />} />

      {/* Knowledge */}
      <Route path="/knowledge/register" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><MasterDocumentIndex /></React.Suspense></ProtectedRoute>} />
      <Route path="/knowledge/manuals" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Manuals /></React.Suspense></ProtectedRoute>} />
      <Route path="/knowledge/sops" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Procedures /></React.Suspense></ProtectedRoute>} />
      <Route path="/knowledge/policies" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Policies /></React.Suspense></ProtectedRoute>} />
      <Route path="/knowledge/handbooks" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><ISM_SMS /></React.Suspense></ProtectedRoute>} />
      <Route path="/knowledge/drawings" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Drawings /></React.Suspense></ProtectedRoute>} />
      <Route path="/knowledge/templates" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/ism/forms/pages/FormTemplates')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/knowledge/emergency-plans" element={<PlaceholderWrapper title="Emergency Plans" />} />

      {/* Administration */}
      <Route path="/administration/company" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CompanyDetails /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/emergency-contacts" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/administration/emergency-contacts/:vesselId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/administration/users" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><UserManagement /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/roles" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}><RolesPermissionsPage /></React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/administration/vessel-settings" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Settings /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/vessel-settings/*" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><Settings /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/fleet-settings" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><FleetGroups /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/notifications" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><AlertConfiguration /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/integrations" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><APIIntegrations /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/branding" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><BrandingSettings /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/hr" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><HRPage /></React.Suspense></ProtectedRoute>} />
      <Route path="/administration/feedback" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<LazyLoader />}><FeedbackAdmin /></React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/administration/training" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/development/pages/DevelopmentAdmin')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/administration/audit-logs" element={<PlaceholderWrapper title="Audit Logs" />} />
      <Route path="/administration/api-access" element={<PlaceholderWrapper title="API Access" />} />

      {/* Emergency (pinned) */}
      <Route path="/emergency" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/vessels/pages/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Charter & Guest, Procurement — all phase 2 placeholders */}
      <Route path="/charter/bookings" element={<PlaceholderWrapper title="Bookings & Contracts" />} />
      <Route path="/charter/billing" element={<PlaceholderWrapper title="Billing" />} />
      <Route path="/charter/broker-comms" element={<PlaceholderWrapper title="Broker Comms" />} />
      <Route path="/charter/guest-preferences" element={<PlaceholderWrapper title="Guest Preferences" />} />
      <Route path="/charter/provisioning" element={<PlaceholderWrapper title="Provisioning" />} />
      <Route path="/charter/service-delivery" element={<PlaceholderWrapper title="Service Delivery" />} />
      <Route path="/charter/turnaround" element={<PlaceholderWrapper title="Turnaround" />} />
      <Route path="/charter/briefing-packs" element={<PlaceholderWrapper title="Briefing Packs" />} />
      <Route path="/procurement/requisitions" element={<PlaceholderWrapper title="Requisitions" />} />
      <Route path="/procurement/purchase-orders" element={<PlaceholderWrapper title="Purchase Orders" />} />
      <Route path="/procurement/vendors" element={<PlaceholderWrapper title="Vendors" />} />
      <Route path="/procurement/budgets" element={<PlaceholderWrapper title="Budgets" />} />
      <Route path="/procurement/approvals" element={<PlaceholderWrapper title="Approvals" />} />

      {/* Insights (phase 2) */}
      <Route path="/insights" element={<Navigate to="/insights/incidents" replace />} />
      <Route path="/insights/incidents" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><IncidentAnalytics /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/insights/capa" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><CAPATracker /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/insights/drills" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><DrillAnalytics /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/insights/trip-suggestions" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}>
            {React.createElement(React.lazy(() => import('@/modules/itinerary/pages/TripSuggestionsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Catch-all - redirect to home instead of 404 */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
};

export default AppRoutes;
