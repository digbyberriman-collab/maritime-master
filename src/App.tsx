import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/modules/auth/contexts/AuthContext";
import { BrandingProvider } from "@/shared/contexts/BrandingContext";
import { VesselProvider } from "@/modules/vessels/contexts/VesselContext";
import AppRoutes from "@/routes";
import AppErrorBoundary from "@/shared/components/AppErrorBoundary";

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
              <AppErrorBoundary>
                <AppRoutes />
              </AppErrorBoundary>
            </VesselProvider>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
