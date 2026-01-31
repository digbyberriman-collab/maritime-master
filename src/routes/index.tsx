import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { 
  Ship, Users, Award, Plane, Clock, CalendarDays,
  AlertTriangle, ClipboardList, BookOpen, Shield, FileCheck, Layers, LayoutGrid,
  Package, Bell, Settings as SettingsIcon, Building2, Phone, Wrench, FileText, Calendar
} from 'lucide-react';

// Main Pages - Keep critical path pages sync, lazy load the rest
import Index from '@/pages/Index';
import Auth from '@/pages/Auth';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';

// Lazy loaded pages
const Vessels = React.lazy(() => import('@/pages/Vessels'));
const VesselDashboard = React.lazy(() => import('@/pages/VesselDashboard'));
const CrewRoster = React.lazy(() => import('@/pages/CrewRoster'));
const Documents = React.lazy(() => import('@/pages/Documents'));
const Certificates = React.lazy(() => import('@/pages/Certificates'));
const Incidents = React.lazy(() => import('@/pages/Incidents'));
const Audits = React.lazy(() => import('@/pages/Audits'));
const Drills = React.lazy(() => import('@/pages/Drills'));
const Training = React.lazy(() => import('@/pages/Training'));
const Maintenance = React.lazy(() => import('@/pages/Maintenance'));
const FleetMap = React.lazy(() => import('@/pages/FleetMap'));
const RiskAssessments = React.lazy(() => import('@/pages/RiskAssessments'));
const Alerts = React.lazy(() => import('@/pages/Alerts'));
const Settings = React.lazy(() => import('@/pages/Settings'));
const NotFound = React.lazy(() => import('@/pages/NotFound'));
const InsurancePage = React.lazy(() => import('@/pages/InsurancePage'));
const HRPage = React.lazy(() => import('@/pages/HRPage'));

// ISM Pages - Lazy loaded for better code splitting
const ERMPage = React.lazy(() => import('@/pages/ism/ERMPage'));
const ChecklistsPage = React.lazy(() => import('@/pages/ism/ChecklistsPage'));
const RiskAssessmentsPage = React.lazy(() => import('@/pages/ism/RiskAssessmentsPage'));
const SOPsPage = React.lazy(() => import('@/pages/ism/SOPsPage'));
const AuditsSurveysPage = React.lazy(() => import('@/pages/ism/AuditsSurveysPage'));
const CorrectiveActionsPage = React.lazy(() => import('@/pages/ism/CorrectiveActionsPage'));
const ISMDrillsPage = React.lazy(() => import('@/pages/ism/DrillsPage'));
const ISMIncidentsPage = React.lazy(() => import('@/pages/ism/IncidentsPage'));
const InvestigationsPage = React.lazy(() => import('@/pages/ism/InvestigationsPage'));
const MeetingsPage = React.lazy(() => import('@/pages/ism/MeetingsPage'));
const MiscellaneousPage = React.lazy(() => import('@/pages/ism/MiscellaneousPage'));
const NonConformitiesPage = React.lazy(() => import('@/pages/ism/NonConformitiesPage'));
const ObservationsPage = React.lazy(() => import('@/pages/ism/ObservationsPage'));
const PermitsToWorkPage = React.lazy(() => import('@/pages/ism/PermitsToWorkPage'));
const ISMTrainingPage = React.lazy(() => import('@/pages/ism/TrainingPage'));

// Document Sub-pages - lazy loaded
const ReviewQueue = React.lazy(() => import('@/pages/ReviewQueue'));
const AcknowledgmentTracking = React.lazy(() => import('@/pages/AcknowledgmentTracking'));
const MasterDocumentIndex = React.lazy(() => import('@/pages/MasterDocumentIndex'));
const DocumentSearch = React.lazy(() => import('@/pages/DocumentSearch'));
const ReviewDashboard = React.lazy(() => import('@/pages/ReviewDashboard'));

// Report Pages - lazy loaded (heavy recharts dependency)
const IncidentAnalytics = React.lazy(() => import('@/pages/IncidentAnalytics'));
const CAPATracker = React.lazy(() => import('@/pages/CAPATracker'));
const DrillAnalytics = React.lazy(() => import('@/pages/DrillAnalytics'));
const CertificateAlerts = React.lazy(() => import('@/pages/CertificateAlerts'));

// Settings Sub-pages - lazy loaded
const BrandingSettings = React.lazy(() => import('@/pages/BrandingSettings'));
const DPADashboard = React.lazy(() => import('@/pages/DPADashboard'));
const RolesPermissionsPage = React.lazy(() => import('@/pages/settings/RolesPermissionsPage'));

// Admin Pages - lazy loaded
const UserManagement = React.lazy(() => import('@/pages/admin/UserManagement'));
const FleetGroups = React.lazy(() => import('@/pages/admin/FleetGroups'));
const AlertConfiguration = React.lazy(() => import('@/pages/admin/AlertConfiguration'));
const APIIntegrations = React.lazy(() => import('@/pages/admin/APIIntegrations'));

// Document Pages - lazy loaded
const Manuals = React.lazy(() => import('@/pages/documents/Manuals'));
const Policies = React.lazy(() => import('@/pages/documents/Policies'));
const Procedures = React.lazy(() => import('@/pages/documents/Procedures'));
const ISM_SMS = React.lazy(() => import('@/pages/documents/ISM_SMS'));
const Drawings = React.lazy(() => import('@/pages/documents/Drawings'));

// Crew Pages - lazy loaded
const FlightsTravel = React.lazy(() => import('@/pages/crew/FlightsTravel'));
const LeaveManagement = React.lazy(() => import('@/pages/crew/LeaveManagement'));
const TravelRecordDetail = React.lazy(() => import('@/pages/crew/admin/TravelRecordDetail'));
const QuarantineBookingsPage = React.lazy(() => import('@/pages/crew/admin/QuarantineBookingsPage'));

// Certificate Pages - lazy loaded
const CrewCertificatesOverview = React.lazy(() => import('@/pages/certificates/CrewCertificatesOverview'));

// ISM Forms Pages - lazy loaded
const DraftTemplates = React.lazy(() => import('@/pages/ism/forms/DraftTemplates'));
const FormsArchive = React.lazy(() => import('@/pages/ism/forms/FormsArchive'));
const FormSchedules = React.lazy(() => import('@/pages/ism/forms/FormSchedules'));
const FormExports = React.lazy(() => import('@/pages/ism/forms/FormExports'));

// Maintenance Pages - lazy loaded
const SpareParts = React.lazy(() => import('@/pages/maintenance/SpareParts'));

// Maintenance Pages - lazy loaded
const MaintenanceDefects = React.lazy(() => import('@/pages/maintenance/MaintenanceDefects'));
const CriticalEquipment = React.lazy(() => import('@/pages/maintenance/CriticalEquipment'));

// Vessel Pages - lazy loaded
const CompanyDetails = React.lazy(() => import('@/pages/vessels/CompanyDetails'));

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
            {React.createElement(React.lazy(() => import('@/pages/vessels/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/vessels/:vesselId/emergency" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/vessels/VesselEmergencyDetailsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Crew */}
      <Route path="/crew" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CrewRoster /></React.Suspense></ProtectedRoute>} />
      <Route path="/crew/roster" element={<ProtectedRoute><React.Suspense fallback={<LazyLoader />}><CrewRoster /></React.Suspense></ProtectedRoute>} />
      <Route path="/crew/certificates" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/CrewDocuments')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/flights" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><FlightsTravel /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/hours-of-rest" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/HoursOfRest')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/calendar" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/VesselCalendar')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/my-dashboard" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/CrewDashboard')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/leave" element={
        <ProtectedRoute>
          <React.Suspense fallback={<LazyLoader />}><LeaveManagement /></React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/tasks" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/CrewTasksPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/acknowledgements" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/DocumentAcknowledgementsPage')))}
          </React.Suspense>
        </ProtectedRoute>
      } />

      {/* Crew Admin */}
      <Route path="/crew/admin" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/CrewAdminDashboard')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/travel" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/TravelRecordsPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/travel/new" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/CreateTravelRecordPage')))}
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
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/PreDepartureListPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/pre-departure/:id" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/PreDepartureDetailPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/documents" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/TravelDocumentsPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/documents/upload" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/DocumentUploadPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/quarantine" element={
        <ProtectedRoute>
          <DashboardLayout>
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              {React.createElement(React.lazy(() => import('@/pages/crew/admin/QuarantineHousesPage')))}
            </React.Suspense>
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/quarantine/bookings" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Quarantine Bookings" 
            description="Manage crew quarantine accommodation bookings"
            icon={<CalendarDays className="w-8 h-8 text-primary" />}
            features={['Active bookings', 'Check-in/out tracking', 'Cost management', 'Provisioning requests']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/crew/admin/quarantine/new" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Add Quarantine House" 
            description="Register a new quarantine accommodation facility"
            icon={<Building2 className="w-8 h-8 text-primary" />}
            features={['Location details', 'Room capacity', 'Contact information', 'Cost per night']} 
          />
        </ProtectedRoute>
      } />

      {/* ISM - Parent redirect */}
      <Route path="/ism" element={<Navigate to="/ism/forms/templates" replace />} />

      {/* ISM - Forms */}
      <Route path="/ism/forms" element={<Navigate to="/ism/forms/templates" replace />} />
      <Route path="/ism/forms/templates" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/FormTemplates')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/templates/create" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/CreateTemplate')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/templates/:templateId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/TemplateDetail')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/templates/:templateId/edit" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/CreateTemplate')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/new" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/FormSubmission')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/submission/:submissionId" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/FormSubmission')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/submissions" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/SubmissionsList')))}
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
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/MyDrafts')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/pending" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div>Loading...</div>}>
            {React.createElement(React.lazy(() => import('@/pages/ism/forms/PendingSignatures')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/archive" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Submitted / Archive" 
            description="Completed and archived form submissions"
            icon={<FileText className="w-8 h-8 text-primary" />}
            features={['Search archive', 'Export to PDF', 'View audit trail']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/schedules" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Form Schedules" 
            description="Recurring form schedules"
            icon={<Calendar className="w-8 h-8 text-primary" />}
            features={['Create schedules', 'Assign to vessels', 'Set recurrence']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/forms/exports" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Form Exports" 
            description="Export forms to PDF or Excel"
            icon={<FileText className="w-8 h-8 text-primary" />}
            features={['Bulk export', 'Custom date ranges', 'Format selection']} 
          />
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
          <PlaceholderWrapper 
            title="Procedures & SOPs" 
            description="Standard operating procedures"
            icon={<ClipboardList className="w-8 h-8 text-primary" />}
            features={['Standard procedures', 'Work instructions', 'Linked checklists', 'Amendment tracking']} 
          />
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
          <PlaceholderWrapper 
            title="Spare Parts" 
            description="Spare parts inventory management"
            icon={<Package className="w-8 h-8 text-primary" />}
            features={['Inventory levels', 'Reorder alerts', 'Critical spares list', 'Location tracking']} 
          />
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

      {/* Catch-all - redirect to dashboard instead of 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRoutes;
