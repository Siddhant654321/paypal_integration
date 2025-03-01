import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Auction, Payout } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, Search, DollarSign, Package } from "lucide-react";
import { Link, Redirect } from "wouter";
import AuctionCard from "@/components/auction-card";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react"; 
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { formatPrice } from '../utils/formatters';
import { apiRequest } from "@/lib/queryClient";

interface StripeStatus {
  status: "not_started" | "pending" | "verified" | "rejected";
}

interface StripeWindow extends Window {
  Stripe?: any;
}

declare global {
  interface Window extends StripeWindow {}
}

const SellerDashboard = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeInstance, setStripeInstance] = useState<any>(null);

  // Redirect if not a seller or seller_admin
  if (!user || (user.role !== "seller" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  // Fetch auctions with isLoading state
  const { data: auctions, isLoading: auctionsLoading } = useQuery<Auction[]>({
    queryKey: ["/api/seller/auctions"],
    select: (data) => data || [], // Ensure we always have an array
  });

  // Fetch bids with isLoading state
  const { data: biddingOn, isLoading: bidsLoading } = useQuery<Auction[]>({
    queryKey: ["/api/user/bids"],
    select: (data) => data || [], // Ensure we always have an array
  });

  // Fetch payouts with isLoading state
  const { data: payouts, isLoading: payoutsLoading } = useQuery<Payout[]>({
    queryKey: ["/api/seller/payouts"],
    select: (data) => data || [], // Ensure we always have an array
  });

  const { data: stripeStatus } = useQuery<StripeStatus>({
    queryKey: ["/api/seller/status"],
  });

  // Load Stripe.js
  useEffect(() => {
    if (window.Stripe || stripeLoaded) return;

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;

    script.onload = () => {
      setStripeLoaded(true);
      if (window.Stripe) {
        const stripe = window.Stripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
        setStripeInstance(stripe);
      }
    };

    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Connect with Stripe mutation
  const connectWithStripeMutation = useMutation({
    mutationFn: () => apiRequest('/api/seller/connect', { method: 'POST' }),
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  // Refresh onboarding mutation
  const refreshOnboardingMutation = useMutation({
    mutationFn: () => apiRequest('/api/seller/onboarding/refresh', { method: 'POST' }),
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  // Safe filtering functions
  const safeFilter = (auction: Auction) => {
    const searchLower = searchTerm.toLowerCase();
    const titleMatch = auction.title?.toLowerCase().includes(searchLower) || false;
    const descMatch = auction.description?.toLowerCase().includes(searchLower) || false;
    return titleMatch || descMatch;
  };

  // Filter auctions only if we have data
  const filteredAuctions = auctions ? auctions.filter(safeFilter) : [];
  const filteredBiddingOn = biddingOn ? biddingOn.filter(safeFilter) : [];

  // Categorize auctions
  const pendingAuctions = filteredAuctions.filter(auction => !auction.approved);
  const approvedAuctions = filteredAuctions.filter(auction => auction.approved);
  const endedAuctions = filteredAuctions.filter(auction => auction.status === "ended");

  // Render Stripe Connect status and actions
  const renderStripeConnectStatus = () => {
    if (!stripeStatus) return null;

    switch (stripeStatus.status) {
      case "not_started":
        return (
          <div className="text-center p-8 bg-muted rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Set Up Payouts</h3>
            <p className="text-muted-foreground mb-4">
              To receive payouts from your auctions, you'll need to connect your Stripe account.
              This allows us to securely transfer payments to your bank account.
            </p>
            <Button 
              onClick={() => connectWithStripeMutation.mutate()}
              disabled={connectWithStripeMutation.isPending}
            >
              {connectWithStripeMutation.isPending ? "Setting up..." : "Connect with Stripe"}
            </Button>
          </div>
        );

      case "pending":
        return (
          <div className="text-center p-8 bg-yellow-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Complete Your Stripe Setup</h3>
            <p className="text-muted-foreground mb-4">
              You've started the Stripe connection process, but there are still some steps to complete.
            </p>
            <Button 
              onClick={() => refreshOnboardingMutation.mutate()}
              disabled={refreshOnboardingMutation.isPending}
            >
              Complete Setup
            </Button>
          </div>
        );

      case "verified":
        return (
          <div className="text-center p-4 bg-green-50 rounded-lg mb-6">
            <p className="text-green-800">
              ✓ Your Stripe account is connected and ready to receive payouts
            </p>
          </div>
        );

      case "rejected":
        return (
          <div className="text-center p-8 bg-red-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Account Verification Failed</h3>
            <p className="text-muted-foreground mb-4">
              There was an issue verifying your Stripe account. Please try again or contact support.
            </p>
            <Button 
              onClick={() => connectWithStripeMutation.mutate()}
              disabled={connectWithStripeMutation.isPending}
            >
              Try Again
            </Button>
          </div>
        );
    }
  };

  const renderAuctionCard = (auction: Auction) => (
    <div key={auction.id} className="space-y-2">
      <AuctionCard 
        auction={auction}
        showStatus={true}
      />
      {auction.status === "ended" && auction.winningBidderId && (
        <div className="space-y-2">
          {auction.paymentStatus !== "completed" ? (
            <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
              Waiting for buyer payment before fulfillment
            </div>
          ) : (
            <Link href={`/seller/fulfill/${auction.id}`}>
              <Button 
                className="w-full"
                variant="default"
              >
                <Package className="h-4 w-4 mr-2" />
                Fulfill Order
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );

  // Show loading state while data is being fetched
  if (auctionsLoading || bidsLoading || payoutsLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Auctions</h1>
        <Link href="/seller/new-auction">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create New Auction
          </Button>
        </Link>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search auctions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="myAuctions">
        <TabsList className="w-full">
          <TabsTrigger value="myAuctions">My Auctions</TabsTrigger>
          <TabsTrigger value="payouts">
            <DollarSign className="w-4 h-4 mr-2" />
            Payouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="myAuctions">
          <Tabs defaultValue="approved">
            <TabsList className="w-full">
              <TabsTrigger value="approved">
                Active Auctions ({approvedAuctions.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending Approval ({pendingAuctions.length})
              </TabsTrigger>
              <TabsTrigger value="ended">
                Ended Auctions ({endedAuctions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="approved">
              {approvedAuctions.length === 0 ? (
                <div className="text-center text-muted-foreground">
                  No approved auctions found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {approvedAuctions.map(renderAuctionCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pending">
              {pendingAuctions.length === 0 ? (
                <div className="text-center text-muted-foreground">
                  No pending auctions found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingAuctions.map(renderAuctionCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ended">
              {endedAuctions.length === 0 ? (
                <div className="text-center text-muted-foreground">
                  No ended auctions found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {endedAuctions.map(renderAuctionCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="payouts">
          {renderStripeConnectStatus()}
          {payoutsLoading ? (
            <div className="text-center">Loading your payouts...</div>
          ) : payouts.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No payouts found. Completed auction payments will appear here.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Amount
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Stripe Transfer ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-popover divide-y divide-border">
                    {payouts.map((payout) => (
                      <tr key={payout.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {formatDistanceToNow(new Date(payout.createdAt), { addSuffix: true })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {formatPrice(payout.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                            ${payout.status === 'completed' ? 'bg-green-100 text-green-800' :
                              payout.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              payout.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'}`}>
                            {payout.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {payout.stripeTransferId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SellerDashboard;