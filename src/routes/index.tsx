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

// Main Pages
import Index from '@/pages/Index';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import Vessels from '@/pages/Vessels';
import CrewRoster from '@/pages/CrewRoster';
import Documents from '@/pages/Documents';
import Certificates from '@/pages/Certificates';
import Incidents from '@/pages/Incidents';
import Audits from '@/pages/Audits';
import Drills from '@/pages/Drills';
import Training from '@/pages/Training';
import Maintenance from '@/pages/Maintenance';
import FleetMap from '@/pages/FleetMap';
import RiskAssessments from '@/pages/RiskAssessments';
import Alerts from '@/pages/Alerts';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';
import InsurancePage from '@/pages/InsurancePage';
import HRPage from '@/pages/HRPage';

// ISM Pages - Flat navigation with internal tabs
import {
  ERMPage,
  ChecklistsPage,
  RiskAssessmentsPage,
  SOPsPage,
  AuditsSurveysPage,
  CorrectiveActionsPage,
  DrillsPage as ISMDrillsPage,
  IncidentsPage as ISMIncidentsPage,
  InvestigationsPage,
  MeetingsPage,
  MiscellaneousPage,
  NonConformitiesPage,
  ObservationsPage,
  PermitsToWorkPage,
  TrainingPage as ISMTrainingPage,
} from '@/pages/ism';

// Document Sub-pages
import ReviewQueue from '@/pages/ReviewQueue';
import AcknowledgmentTracking from '@/pages/AcknowledgmentTracking';
import MasterDocumentIndex from '@/pages/MasterDocumentIndex';
import DocumentSearch from '@/pages/DocumentSearch';
import ReviewDashboard from '@/pages/ReviewDashboard';

// Report Pages
import IncidentAnalytics from '@/pages/IncidentAnalytics';
import CAPATracker from '@/pages/CAPATracker';
import DrillAnalytics from '@/pages/DrillAnalytics';
import CertificateAlerts from '@/pages/CertificateAlerts';

// Settings Sub-pages
import BrandingSettings from '@/pages/BrandingSettings';
import DPADashboard from '@/pages/DPADashboard';
import RolesPermissionsPage from '@/pages/settings/RolesPermissionsPage';

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

      {/* Dashboard */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dpa-dashboard" element={<ProtectedRoute><DPADashboard /></ProtectedRoute>} />

      {/* Fleet Map */}
      <Route path="/fleet-map" element={<ProtectedRoute><FleetMap /></ProtectedRoute>} />

      {/* Vessels */}
      <Route path="/vessels" element={<ProtectedRoute><Vessels /></ProtectedRoute>} />
      <Route path="/vessels/dashboard" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Vessel Dashboard" 
            description="Comprehensive vessel overview and status monitoring"
            icon={<LayoutGrid className="w-8 h-8 text-primary" />}
            features={['Vessel overview tiles', 'Key performance metrics', 'Quick actions menu', 'Recent activity feed']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/vessels/company-details" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Company Details" 
            description="Company information and management contacts"
            icon={<Building2 className="w-8 h-8 text-primary" />}
            features={['Company information', 'DPA contacts', 'Management contacts', 'Technical manager details']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/vessels/emergency-details" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Emergency Details" 
            description="Emergency contacts and response procedures"
            icon={<Phone className="w-8 h-8 text-primary" />}
            features={['Emergency contacts list', 'MRCC information', 'Flag state contacts', 'Medical support contacts']} 
          />
        </ProtectedRoute>
      } />

      {/* Crew */}
      <Route path="/crew" element={<ProtectedRoute><CrewRoster /></ProtectedRoute>} />
      <Route path="/crew/roster" element={<ProtectedRoute><CrewRoster /></ProtectedRoute>} />
      <Route path="/crew/certificates" element={
        <ProtectedRoute>
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            {React.createElement(React.lazy(() => import('@/pages/crew/CrewDocuments')))}
          </React.Suspense>
        </ProtectedRoute>
      } />
      <Route path="/crew/flights" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Flights & Travel" 
            description="Travel arrangements and flight booking management"
            icon={<Plane className="w-8 h-8 text-primary" />}
            features={['Flight request forms', 'Travel agent portal integration', 'Itinerary management', 'Travel letter generation']} 
          />
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
          <PlaceholderWrapper 
            title="Leave Management" 
            description="Crew leave requests and approval workflow"
            icon={<CalendarDays className="w-8 h-8 text-primary" />}
            features={['Leave request submission', 'Approval workflow', 'Balance tracking', 'Travel day calculations']} 
          />
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
          <PlaceholderWrapper 
            title="Travel Record Detail" 
            description="View and manage travel record details"
            icon={<Plane className="w-8 h-8 text-primary" />}
            features={['Flight segments', 'Document attachments', 'Pre-departure status', 'Cost tracking']} 
          />
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
          <PlaceholderWrapper 
            title="Draft Templates" 
            description="Templates in draft state awaiting review"
            icon={<FileText className="w-8 h-8 text-primary" />}
            features={['Draft template list', 'Edit & preview', 'Submit for review']} 
          />
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
      
      {/* ISM - 15 Flat Routes (Alphabetical) */}
      <Route path="/ism/audits-surveys" element={<ProtectedRoute><AuditsSurveysPage /></ProtectedRoute>} />
      <Route path="/ism/checklists" element={<ProtectedRoute><ChecklistsPage /></ProtectedRoute>} />
      <Route path="/ism/corrective-actions" element={<ProtectedRoute><CorrectiveActionsPage /></ProtectedRoute>} />
      <Route path="/ism/drills" element={<ProtectedRoute><ISMDrillsPage /></ProtectedRoute>} />
      <Route path="/ism/erm" element={<ProtectedRoute><ERMPage /></ProtectedRoute>} />
      <Route path="/ism/incidents" element={<ProtectedRoute><ISMIncidentsPage /></ProtectedRoute>} />
      <Route path="/ism/investigations" element={<ProtectedRoute><InvestigationsPage /></ProtectedRoute>} />
      <Route path="/ism/meetings" element={<ProtectedRoute><MeetingsPage /></ProtectedRoute>} />
      <Route path="/ism/miscellaneous" element={<ProtectedRoute><MiscellaneousPage /></ProtectedRoute>} />
      <Route path="/ism/non-conformities" element={<ProtectedRoute><NonConformitiesPage /></ProtectedRoute>} />
      <Route path="/ism/observations" element={<ProtectedRoute><ObservationsPage /></ProtectedRoute>} />
      <Route path="/ism/permits-to-work" element={<ProtectedRoute><PermitsToWorkPage /></ProtectedRoute>} />
      <Route path="/ism/risk-assessments" element={<ProtectedRoute><RiskAssessmentsPage /></ProtectedRoute>} />
      <Route path="/ism/sops" element={<ProtectedRoute><SOPsPage /></ProtectedRoute>} />
      <Route path="/ism/training" element={<ProtectedRoute><ISMTrainingPage /></ProtectedRoute>} />

      {/* ISM - Legacy redirect */}
      <Route path="/ism/capa" element={<Navigate to="/ism/corrective-actions" replace />} />
      <Route path="/ism/audits" element={<Navigate to="/ism/audits-surveys" replace />} />

      {/* Certificates */}
      <Route path="/certificates" element={<ProtectedRoute><Certificates /></ProtectedRoute>} />
      <Route path="/certificates/vessel" element={<ProtectedRoute><Certificates /></ProtectedRoute>} />
      <Route path="/certificates/crew" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Crew Certificates Overview" 
            description="Fleet-wide crew certification compliance"
            icon={<Users className="w-8 h-8 text-primary" />}
            features={['Fleet-wide certificate view', 'Expiry dashboard', 'Compliance matrix', 'Renewal tracking']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/certificates/alerts" element={<ProtectedRoute><CertificateAlerts /></ProtectedRoute>} />

      {/* Documents */}
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/documents/manuals" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Manuals" 
            description="Operational and safety manuals"
            icon={<BookOpen className="w-8 h-8 text-primary" />}
            features={['Safety Management Manual', 'Operations manuals', 'Version control', 'Distribution tracking']} 
          />
        </ProtectedRoute>
      } />
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
          <PlaceholderWrapper 
            title="ISM / SMS" 
            description="ISM code and Safety Management System documents"
            icon={<Shield className="w-8 h-8 text-primary" />}
            features={['SMS documentation', 'ISM Code compliance', 'Document control', 'Audit evidence']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/documents/policies" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Policies" 
            description="Company policies and guidelines"
            icon={<FileCheck className="w-8 h-8 text-primary" />}
            features={['Company policies', 'Vessel policies', 'Shore-side policies', 'Acknowledgment tracking']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/documents/drawings" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Drawings" 
            description="Technical drawings and plans"
            icon={<Layers className="w-8 h-8 text-primary" />}
            features={['GA plans', 'Safety plans', 'System diagrams', 'Review status tracking']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/documents/search" element={<ProtectedRoute><DocumentSearch /></ProtectedRoute>} />
      <Route path="/documents/master-index" element={<ProtectedRoute><MasterDocumentIndex /></ProtectedRoute>} />
      <Route path="/documents/reviews" element={<ProtectedRoute><ReviewDashboard /></ProtectedRoute>} />
      <Route path="/review-queue" element={<ProtectedRoute><ReviewQueue /></ProtectedRoute>} />
      <Route path="/acknowledgments" element={<ProtectedRoute><AcknowledgmentTracking /></ProtectedRoute>} />

      {/* HR */}
      <Route path="/hr" element={<ProtectedRoute><HRPage /></ProtectedRoute>} />

      {/* Insurance */}
      <Route path="/insurance" element={<ProtectedRoute><InsurancePage /></ProtectedRoute>} />

      {/* Maintenance */}
      <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
      <Route path="/maintenance/dashboard" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
      <Route path="/maintenance/defects" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Open Defects" 
            description="Track and manage open defects"
            icon={<AlertTriangle className="w-8 h-8 text-primary" />}
            features={['Defect list from IDEA', 'Priority tracking', 'ISM critical flags', 'Resolution workflow']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/maintenance/critical" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Critical Equipment" 
            description="Critical equipment status monitoring"
            icon={<Shield className="w-8 h-8 text-primary" />}
            features={['ISM critical equipment list', 'Maintenance status', 'Spare parts tracking', 'Test records']} 
          />
        </ProtectedRoute>
      } />
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
      <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />

      {/* Settings */}
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/settings/*" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/settings/branding" element={<ProtectedRoute><BrandingSettings /></ProtectedRoute>} />
      <Route path="/settings/permissions" element={
        <ProtectedRoute>
          <DashboardLayout>
            <RolesPermissionsPage />
          </DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
      <Route path="/admin/users" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="User Management" 
            description="Manage users and access permissions"
            icon={<Users className="w-8 h-8 text-primary" />}
            features={['User list & search', 'Role assignment', 'Vessel access control', 'Account status management']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/admin/roles" element={
        <ProtectedRoute>
          <DashboardLayout>
            <RolesPermissionsPage />
          </DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/fleet-groups" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Fleet Groups" 
            description="Manage fleet groupings and hierarchies"
            icon={<Ship className="w-8 h-8 text-primary" />}
            features={['Group management', 'Vessel assignment', 'Color coding', 'Reporting groups']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/admin/alerts" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Alert Configuration" 
            description="Configure alert rules and escalation"
            icon={<Bell className="w-8 h-8 text-primary" />}
            features={['Alert rules', 'Escalation settings', 'Notification channels', 'Severity thresholds']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/admin/integrations" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="API Integrations" 
            description="Third-party API and system integrations"
            icon={<Wrench className="w-8 h-8 text-primary" />}
            features={['AIS provider config', 'IDEA connection', 'Email service', 'External API keys']} 
          />
        </ProtectedRoute>
      } />

      {/* Legacy/Report Routes */}
      <Route path="/drills" element={<ProtectedRoute><Drills /></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
      <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
      <Route path="/audits" element={<ProtectedRoute><Audits /></ProtectedRoute>} />
      <Route path="/risk-assessments" element={<ProtectedRoute><RiskAssessments /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><IncidentAnalytics /></ProtectedRoute>} />
      <Route path="/reports/incident-analytics" element={<ProtectedRoute><IncidentAnalytics /></ProtectedRoute>} />
      <Route path="/reports/capa-tracker" element={<ProtectedRoute><CAPATracker /></ProtectedRoute>} />
      <Route path="/reports/drill-analytics" element={<ProtectedRoute><DrillAnalytics /></ProtectedRoute>} />

      {/* Catch-all - redirect to dashboard instead of 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRoutes;
