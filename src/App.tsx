import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Partners from "@/pages/Partners";
import PartnerDetail from "@/pages/PartnerDetail";
import ClientsLicenses from "@/pages/ClientsLicenses";
import ClientDetail from "@/pages/ClientDetail";
import Renewals from "@/pages/Renewals";
import Analytics from "@/pages/Analytics";
import Notifications from "@/pages/Notifications";
import Pipeline from "@/pages/Pipeline";
import DealDetail from "@/pages/DealDetail";
import DealRegistrations from "@/pages/DealRegistrations";
import Commissions from "@/pages/Commissions";
import ComingSoon from "@/pages/ComingSoon";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/partners/:id" element={<PartnerDetail />} />
            <Route path="/clients" element={<ClientsLicenses />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/renewals" element={<Renewals />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/deals/:id" element={<DealDetail />} />
            <Route path="/deals/new" element={<ComingSoon />} />
            <Route path="/deal-registrations" element={<DealRegistrations />} />
            <Route path="/commissions" element={<Commissions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/knowledge" element={<ComingSoon />} />
            <Route path="/training" element={<ComingSoon />} />
            <Route path="/community" element={<ComingSoon />} />
            <Route path="/announcements" element={<ComingSoon />} />
            <Route path="/settings" element={<ComingSoon />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
