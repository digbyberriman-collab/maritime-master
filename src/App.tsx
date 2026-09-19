import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/modules/auth/contexts/AuthContext";
import { BrandingProvider } from "@/shared/contexts/BrandingContext";
import { VesselProvider } from "@/modules/vessels/contexts/VesselContext";
import ErrorBoundary from "@/shared/components/ErrorBoundary";
import AppRoutes from "@/routes";

// Defaults, because none were set: queries refetched on every mount and focus
// and retried three times, which multiplies load on a slow link at sea. A
// short staleness window keeps navigation cheap without hiding fresh data,
// and one retry still rides out a dropped request.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <BrandingProvider>
              <VesselProvider>
                <AppRoutes />
              </VesselProvider>
            </BrandingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
