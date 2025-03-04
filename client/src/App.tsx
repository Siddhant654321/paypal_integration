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
import FulfillmentPage from "@/pages/fulfillment-page";
import SellerProfilePage from "@/pages/seller-profile"; // Added import
import BuyerRequestPage from "@/pages/buyer-request-page";
import EditBuyerRequestPage from "@/pages/edit-buyer-request";
import FAQPage from "@/pages/faq-page";

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
        <Route path="/seller/auction/new" component={NewAuction} />
        <Route path="/seller/fulfill/:id" component={FulfillmentPage} />
        <Route path="/seller/:id" component={SellerProfilePage} /> {/* Existing route updated to use :id */}
        <Route path="/buyer/dashboard" component={BuyerDashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/buyer-requests/:id" component={BuyerRequestPage} />
        <Route path="/buyer-requests/:id/edit" component={EditBuyerRequestPage} />
        <Route path="/faq" component={FAQPage} />
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