import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import NavBar from "@/components/nav-bar";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import AuctionPage from "@/pages/auction-page";
import SellerDashboard from "@/pages/seller-dashboard";
import BuyerDashboard from "@/pages/buyer-dashboard";
import NewAuction from "@/pages/new-auction";
import AdminDashboard from "@/pages/admin-dashboard";
import ProfilePage from "@/pages/profile-page";
import PaymentPage from "@/pages/payment-page";
import AnalyticsPage from "@/pages/analytics-page";

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/auction/:id" component={AuctionPage} />
        <Route path="/auction/:id/pay" component={PaymentPage} />
        <Route path="/seller/dashboard" component={SellerDashboard} />
        <Route path="/buyer/dashboard" component={BuyerDashboard} />
        <Route path="/seller/new-auction" component={NewAuction} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;