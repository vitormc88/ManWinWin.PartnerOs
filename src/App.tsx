import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "@/pages/Auth";
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
import Onboarding from "@/pages/Onboarding";
import Certifications from "@/pages/Certifications";
import PartnerTiers from "@/pages/PartnerTiers";
import PartnerPerformance from "@/pages/PartnerPerformance";
import KnowledgeBase from "@/pages/KnowledgeBase";
import ComingSoon from "@/pages/ComingSoon";
import IncomingLeads from "@/pages/IncomingLeads";
import LeadDetail from "@/pages/LeadDetail";
import UserManagement from "@/pages/UserManagement";
import ResetPassword from "@/pages/ResetPassword";
import PricingSettings from "@/pages/PricingSettings";
import Settings, { SettingsComingSoon } from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/partners" element={<Partners />} />
              <Route path="/partners/:id" element={<PartnerDetail />} />
              <Route path="/clients" element={<ClientsLicenses />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
              <Route path="/renewals" element={<Renewals />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/deals/:id" element={<DealDetail />} />
              <Route path="/deals/new" element={<ComingSoon />} />
              <Route path="/deal-registrations" element={<DealRegistrations />} />
              <Route path="/incoming-leads" element={<IncomingLeads />} />
              <Route path="/incoming-leads/:id" element={<LeadDetail />} />
              <Route path="/commissions" element={<Commissions />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/certifications" element={<Certifications />} />
              <Route path="/tiers" element={<PartnerTiers />} />
              <Route path="/performance" element={<PartnerPerformance />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/training" element={<ComingSoon />} />
              <Route path="/community" element={<ComingSoon />} />
              <Route path="/announcements" element={<ComingSoon />} />
              <Route path="/settings" element={<Settings />}>
                <Route path="general" element={<SettingsComingSoon title="General Settings" />} />
                <Route path="pricing" element={<PricingSettings />} />
                <Route path="proposals" element={<SettingsComingSoon title="Proposal Settings" />} />
              </Route>
              <Route path="/users" element={<UserManagement />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
