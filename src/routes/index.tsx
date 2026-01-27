import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { 
  Ship, Users, Award, Plane, Clock, CalendarDays, CheckSquare, Siren, 
  GraduationCap, MessageSquare, AlertCircle, Search, Clipboard, AlertTriangle,
  Eye, ClipboardList, BookOpen, Shield, FileCheck, Layers, LayoutGrid,
  Package, Bell, Settings as SettingsIcon, Building2, Phone, Wrench
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
          <PlaceholderWrapper 
            title="Crew Certificates" 
            description="Crew certification and compliance tracking"
            icon={<Award className="w-8 h-8 text-primary" />}
            features={['Certificate tracking by crew', 'Expiry alerts dashboard', 'Document upload & verification', 'Validation workflow']} 
          />
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
          <PlaceholderWrapper 
            title="Hours of Rest" 
            description="STCW/MLC rest hour compliance tracking"
            icon={<Clock className="w-8 h-8 text-primary" />}
            features={['Rest period logging', 'Compliance status tracking', 'Non-conformity alerts', 'MLC/STCW compliance reports']} 
          />
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

      {/* ISM */}
      <Route path="/ism/checklists" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Checklists & Forms" 
            description="ISM checklists and digital forms for vessel operations"
            icon={<CheckSquare className="w-8 h-8 text-primary" />}
            features={['Electronic forms', 'E-signatures', 'Pre-departure checklists', 'Watchkeeper handovers']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/drills" element={<ProtectedRoute><Drills /></ProtectedRoute>} />
      <Route path="/ism/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
      <Route path="/ism/meetings" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Meetings" 
            description="Safety meetings and committee records"
            icon={<MessageSquare className="w-8 h-8 text-primary" />}
            features={['Safety meeting scheduling', 'HES report logging', 'Meeting minutes', 'Action item tracking']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
      <Route path="/ism/investigations" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Investigations" 
            description="Incident investigation and root cause analysis"
            icon={<Search className="w-8 h-8 text-primary" />}
            features={['Root cause analysis tools', 'Investigation workflow', 'Finding documentation', 'DPA approval process']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/capa" element={<ProtectedRoute><CAPATracker /></ProtectedRoute>} />
      <Route path="/ism/non-conformities" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Non-Conformities" 
            description="Non-conformity reports and closeout tracking"
            icon={<AlertTriangle className="w-8 h-8 text-primary" />}
            features={['NC logging & classification', 'Severity categorization', 'Closure tracking', 'Audit integration']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/observations" element={
        <ProtectedRoute>
          <PlaceholderWrapper 
            title="Observations" 
            description="Safety observations and near-miss reporting"
            icon={<Eye className="w-8 h-8 text-primary" />}
            features={['Observation logging', 'Positive observations', 'Improvement suggestions', 'Trend analysis']} 
          />
        </ProtectedRoute>
      } />
      <Route path="/ism/risk-assessments" element={<ProtectedRoute><RiskAssessments /></ProtectedRoute>} />
      <Route path="/ism/audits" element={<ProtectedRoute><Audits /></ProtectedRoute>} />

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
          <PlaceholderWrapper 
            title="Roles & Permissions" 
            description="Configure roles and permission matrix"
            icon={<Shield className="w-8 h-8 text-primary" />}
            features={['Role definitions', 'Permission matrix', 'Custom roles', 'Field-level redactions']} 
          />
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
