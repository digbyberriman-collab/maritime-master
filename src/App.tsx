import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Vessels from "./pages/Vessels";
import CrewRoster from "./pages/CrewRoster";
import Documents from "./pages/Documents";
import ReviewQueue from "./pages/ReviewQueue";
import AcknowledgmentTracking from "./pages/AcknowledgmentTracking";
import MasterDocumentIndex from "./pages/MasterDocumentIndex";
import DocumentSearch from "./pages/DocumentSearch";
import ReviewDashboard from "./pages/ReviewDashboard";
import BrandingSettings from "./pages/BrandingSettings";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";
import Incidents from "./pages/Incidents";
import IncidentAnalytics from "./pages/IncidentAnalytics";
import CAPATracker from "./pages/CAPATracker";
import Certificates from "./pages/Certificates";
import CertificateAlerts from "./pages/CertificateAlerts";
import Audits from "./pages/Audits";
import Drills from "./pages/Drills";
import DrillAnalytics from "./pages/DrillAnalytics";
import Training from "./pages/Training";
import Maintenance from "./pages/Maintenance";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vessels"
                element={
                  <ProtectedRoute>
                    <Vessels />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents"
                element={
                  <ProtectedRoute>
                    <Documents />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/review-queue"
                element={
                  <ProtectedRoute>
                    <ReviewQueue />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/acknowledgments"
                element={
                  <ProtectedRoute>
                    <AcknowledgmentTracking />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents/master-index"
                element={
                  <ProtectedRoute>
                    <MasterDocumentIndex />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents/search"
                element={
                  <ProtectedRoute>
                    <DocumentSearch />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents/reviews"
                element={
                  <ProtectedRoute>
                    <ReviewDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/compliance"
                element={
                  <ProtectedRoute>
                    <Incidents />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/certificates"
                element={
                  <ProtectedRoute>
                    <Certificates />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/certificates/alerts"
                element={
                  <ProtectedRoute>
                    <CertificateAlerts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/operations"
                element={
                  <ProtectedRoute>
                    <Audits />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audits"
                element={
                  <ProtectedRoute>
                    <Audits />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/drills"
                element={
                  <ProtectedRoute>
                    <Drills />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/drill-analytics"
                element={
                  <ProtectedRoute>
                    <DrillAnalytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/training"
                element={
                  <ProtectedRoute>
                    <Training />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance"
                element={
                  <ProtectedRoute>
                    <Maintenance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/operations/crew"
                element={
                  <ProtectedRoute>
                    <CrewRoster />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <IncidentAnalytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/incident-analytics"
                element={
                  <ProtectedRoute>
                    <IncidentAnalytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/capa-tracker"
                element={
                  <ProtectedRoute>
                    <CAPATracker />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Placeholder title="Settings" description="Configure your account and preferences" />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/branding"
                element={
                  <ProtectedRoute>
                    <BrandingSettings />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
