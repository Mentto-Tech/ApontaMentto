import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useApiWakeUp } from "@/hooks/use-api-wake-up";
import ApiWakeUpScreen from "@/components/ApiWakeUpScreen";
import AppLayout from "@/components/AppLayout";
import { InstallBanner } from "./components/InstallBanner";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Locations from "./pages/Locations";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MonthlyView from "./pages/MonthlyView";
import Timesheet from "./pages/Timesheet";
import Justifications from "./pages/Justifications";
import TimeBank from "./pages/TimeBank";
import AdminUsers from "./pages/AdminUsers";
import AdminPunchLogs from "./pages/AdminPunchLogs";
import AdminSettings from "./pages/AdminSettings";
import NotFound from "./pages/NotFound";

import SignTimesheet from "./pages/SignTimesheet";
import MySignedTimesheets from "./pages/MySignedTimesheets";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const GuestRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
    <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
    <Route path="/assinar/:token" element={<SignTimesheet />} />
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/monthly" element={<MonthlyView />} />
      <Route path="/timesheet" element={<Timesheet />} />
      <Route path="/minhas-folhas" element={<MySignedTimesheets />} />
      <Route path="/justifications" element={<Justifications />} />
      <Route path="/time-bank" element={<TimeBank />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/locations" element={<Locations />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
      <Route path="/admin/logs" element={<AdminRoute><AdminPunchLogs /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => {
  const { isAwake, isOffline, forceAwake } = useApiWakeUp();
  if (!isAwake) return <ApiWakeUpScreen isOffline={isOffline} onContinue={forceAwake} />;

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <InstallBanner />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
