import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { VesselProvider } from "@/contexts/VesselContext";
import ProtectedRoute from "@/components/ProtectedRoute";

// Main Pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Vessels from "./pages/Vessels";
import CrewRoster from "./pages/CrewRoster";
import Documents from "./pages/Documents";
import Certificates from "./pages/Certificates";
import Incidents from "./pages/Incidents";
import Audits from "./pages/Audits";
import Drills from "./pages/Drills";
import Training from "./pages/Training";
import Maintenance from "./pages/Maintenance";
import FleetMap from "./pages/FleetMap";
import RiskAssessments from "./pages/RiskAssessments";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Document Sub-pages
import ReviewQueue from "./pages/ReviewQueue";
import AcknowledgmentTracking from "./pages/AcknowledgmentTracking";
import MasterDocumentIndex from "./pages/MasterDocumentIndex";
import DocumentSearch from "./pages/DocumentSearch";
import ReviewDashboard from "./pages/ReviewDashboard";

// Report Pages
import IncidentAnalytics from "./pages/IncidentAnalytics";
import CAPATracker from "./pages/CAPATracker";
import DrillAnalytics from "./pages/DrillAnalytics";
import CertificateAlerts from "./pages/CertificateAlerts";

// Settings Sub-pages
import BrandingSettings from "./pages/BrandingSettings";
import DPADashboard from "./pages/DPADashboard";

// Placeholder Pages
import ISMPlaceholder from "./pages/placeholder/ISMPlaceholder";
import VesselPlaceholder from "./pages/placeholder/VesselPlaceholder";
import CrewPlaceholder from "./pages/placeholder/CrewPlaceholder";
import DocumentsPlaceholder from "./pages/placeholder/DocumentsPlaceholder";
import MaintenancePlaceholder from "./pages/placeholder/MaintenancePlaceholder";
import CertificatesPlaceholder from "./pages/placeholder/CertificatesPlaceholder";
import AdminPlaceholder from "./pages/placeholder/AdminPlaceholder";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
            <VesselProvider>
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
                <Route path="/vessels/dashboard" element={<ProtectedRoute><VesselPlaceholder /></ProtectedRoute>} />
                <Route path="/vessels/company-details" element={<ProtectedRoute><VesselPlaceholder /></ProtectedRoute>} />
                <Route path="/vessels/emergency-details" element={<ProtectedRoute><VesselPlaceholder /></ProtectedRoute>} />

                {/* Crew */}
                <Route path="/crew" element={<ProtectedRoute><CrewRoster /></ProtectedRoute>} />
                <Route path="/crew/roster" element={<ProtectedRoute><CrewRoster /></ProtectedRoute>} />
                <Route path="/crew/certificates" element={<ProtectedRoute><CrewPlaceholder /></ProtectedRoute>} />
                <Route path="/crew/flights" element={<ProtectedRoute><CrewPlaceholder /></ProtectedRoute>} />
                <Route path="/crew/hours-of-rest" element={<ProtectedRoute><CrewPlaceholder /></ProtectedRoute>} />
                <Route path="/crew/leave" element={<ProtectedRoute><CrewPlaceholder /></ProtectedRoute>} />

                {/* ISM */}
                <Route path="/ism/checklists" element={<ProtectedRoute><ISMPlaceholder /></ProtectedRoute>} />
                <Route path="/ism/drills" element={<ProtectedRoute><Drills /></ProtectedRoute>} />
                <Route path="/ism/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
                <Route path="/ism/meetings" element={<ProtectedRoute><ISMPlaceholder /></ProtectedRoute>} />
                <Route path="/ism/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
                <Route path="/ism/investigations" element={<ProtectedRoute><ISMPlaceholder /></ProtectedRoute>} />
                <Route path="/ism/capa" element={<ProtectedRoute><CAPATracker /></ProtectedRoute>} />
                <Route path="/ism/non-conformities" element={<ProtectedRoute><ISMPlaceholder /></ProtectedRoute>} />
                <Route path="/ism/observations" element={<ProtectedRoute><ISMPlaceholder /></ProtectedRoute>} />
                <Route path="/ism/risk-assessments" element={<ProtectedRoute><RiskAssessments /></ProtectedRoute>} />
                <Route path="/ism/audits" element={<ProtectedRoute><Audits /></ProtectedRoute>} />

                {/* Certificates */}
                <Route path="/certificates" element={<ProtectedRoute><Certificates /></ProtectedRoute>} />
                <Route path="/certificates/vessel" element={<ProtectedRoute><Certificates /></ProtectedRoute>} />
                <Route path="/certificates/crew" element={<ProtectedRoute><CertificatesPlaceholder /></ProtectedRoute>} />
                <Route path="/certificates/alerts" element={<ProtectedRoute><CertificateAlerts /></ProtectedRoute>} />

                {/* Documents */}
                <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
                <Route path="/documents/manuals" element={<ProtectedRoute><DocumentsPlaceholder /></ProtectedRoute>} />
                <Route path="/documents/procedures" element={<ProtectedRoute><DocumentsPlaceholder /></ProtectedRoute>} />
                <Route path="/documents/ism-sms" element={<ProtectedRoute><DocumentsPlaceholder /></ProtectedRoute>} />
                <Route path="/documents/policies" element={<ProtectedRoute><DocumentsPlaceholder /></ProtectedRoute>} />
                <Route path="/documents/drawings" element={<ProtectedRoute><DocumentsPlaceholder /></ProtectedRoute>} />
                <Route path="/documents/search" element={<ProtectedRoute><DocumentSearch /></ProtectedRoute>} />
                <Route path="/documents/master-index" element={<ProtectedRoute><MasterDocumentIndex /></ProtectedRoute>} />
                <Route path="/documents/reviews" element={<ProtectedRoute><ReviewDashboard /></ProtectedRoute>} />
                <Route path="/review-queue" element={<ProtectedRoute><ReviewQueue /></ProtectedRoute>} />
                <Route path="/acknowledgments" element={<ProtectedRoute><AcknowledgmentTracking /></ProtectedRoute>} />

                {/* Maintenance */}
                <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
                <Route path="/maintenance/dashboard" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
                <Route path="/maintenance/defects" element={<ProtectedRoute><MaintenancePlaceholder /></ProtectedRoute>} />
                <Route path="/maintenance/critical" element={<ProtectedRoute><MaintenancePlaceholder /></ProtectedRoute>} />
                <Route path="/maintenance/spares" element={<ProtectedRoute><MaintenancePlaceholder /></ProtectedRoute>} />

                {/* Alerts */}
                <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />

                {/* Settings */}
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/settings/branding" element={<ProtectedRoute><BrandingSettings /></ProtectedRoute>} />

                {/* Admin Routes */}
                <Route path="/admin/users" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />
                <Route path="/admin/roles" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />
                <Route path="/admin/fleet-groups" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />
                <Route path="/admin/alerts" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />
                <Route path="/admin/integrations" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />

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

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </VesselProvider>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
