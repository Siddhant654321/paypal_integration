import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Auction, Payout } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, Search, DollarSign, Package, ExternalLink, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Link, Redirect } from "wouter";
import AuctionCard from "@/components/auction-card";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { formatPrice } from '../utils/formatters';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface StripeStatus {
  status: "not_started" | "pending" | "verified" | "rejected";
}

interface Balance {
  available: { amount: number }[];
  pending: { amount: number }[];
}

interface PayoutSchedule {
  interval: string;
  next_payout_date: number | null;
}

interface StripePayout {
  data: {
    id: string;
    created: number;
    amount: number;
    status: string;
    arrival_date: number | null;
  }[];
}


const SellerDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const searchParams = new URLSearchParams(window.location.search);


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

  const stripeStatusQuery = useQuery<StripeStatus>({
    queryKey: ["/api/seller/status"],
    onSuccess: (data) => console.log("Stripe status data:", data),
    onError: (error) => {
      console.error("Stripe status error:", error);
      // Don't let errors break the UI
      return { status: "not_started" };
    },
    retry: 1
  });

  // Connect with Stripe mutation
  const connectWithStripeMutation = useMutation({
    mutationFn: async () => {
      console.log("Connecting with Stripe...");
      try {
        const response = await fetch('/api/seller/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Connect with Stripe error:", {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          throw new Error(`Failed to connect with Stripe: ${response.status}`);
        }

        const data = await response.json();
        console.log("Connect with Stripe response:", data);

        if (!data?.url) {
          throw new Error('No onboarding URL received');
        }

        // Redirect to Stripe onboarding URL
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error("No URL returned from Stripe");
        }
        return data;
      } catch (err) {
        console.error("Fetch error:", err);
        throw err;
      }
    },
    onError: (error: any) => {
      console.error("Error connecting with Stripe:", error);
      toast({
        title: "Error connecting with Stripe",
        description: error.message || "Failed to connect with Stripe",
        variant: "destructive",
      });
    }
  });

  // Refresh onboarding mutation
  const refreshOnboardingMutation = useMutation({
    mutationFn: async () => {
      console.log("Refreshing Stripe onboarding link...");
      try {
        const response = await fetch('/api/seller/onboarding/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Refresh onboarding error:", {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          throw new Error(`Failed to refresh onboarding: ${response.status}`);
        }

        const data = await response.json();
        console.log("Refresh onboarding response:", data);

        if (!data?.url) {
          throw new Error('No onboarding URL received');
        }

        // Redirect to Stripe onboarding URL
        window.location.href = data.url;
        return data;
      } catch (err) {
        console.error("Fetch error:", err);
        throw err;
      }
    },
    onError: (error: any) => {
      console.error("Error refreshing onboarding:", error);
      toast({
        title: "Error refreshing onboarding",
        description: error.message || "Failed to connect with Stripe",
        variant: "destructive",
      });
    }
  });

  // Add these new query hooks after the existing queries
  const { data: payoutSchedule, isLoading: scheduleLoading } = useQuery<PayoutSchedule>({
    queryKey: ["/api/seller/payout-schedule"],
    enabled: stripeStatusQuery?.data?.status === "verified",
  });

  const { data: balance, isLoading: balanceLoading } = useQuery<Balance>({
    queryKey: ["/api/seller/balance"],
    enabled: stripeStatusQuery?.data?.status === "verified",
  });

  const { data: stripePayouts, isLoading: stripePayoutsLoading } = useQuery<StripePayout>({
    queryKey: ["/api/seller/stripe-payouts"],
    enabled: stripeStatusQuery?.data?.status === "verified",
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
    if (stripeStatusQuery.isLoading) {
      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Loading Stripe Status...</CardTitle>
          </CardHeader>
        </Card>
      );
    }

    if (!stripeStatusQuery.data) {
      return (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Unable to retrieve your Stripe account status. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      );
    }

    // Safely access status with optional chaining
    switch (stripeStatusQuery.data?.status) {
      case "not_started":
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Set Up Your Seller Account</CardTitle>
              <CardDescription>
                Before you can receive payments, you need to connect your Stripe account.
                This is a secure process that allows us to send your earnings directly to your bank account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-medium">What you'll need:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Personal identification (driver's license or passport)</li>
                  <li>Your bank account information</li>
                  <li>Your business information (if applicable)</li>
                </ul>
              </div>
              <Button
                className="w-full"
                onClick={() => connectWithStripeMutation.mutate()}
                disabled={connectWithStripeMutation.isPending}
              >
                {connectWithStripeMutation.isPending ? (
                  "Setting up..."
                ) : (
                  <>
                    Connect with Stripe
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );

      case "pending":
        return (
          <Card className="mb-6 border-yellow-200">
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="mr-2 h-5 w-5 text-yellow-500" />
                Complete Your Account Setup
              </CardTitle>
              <CardDescription>
                You've started the account setup process, but there are still some steps to complete.
                Click below to continue where you left off.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => refreshOnboardingMutation.mutate()}
                disabled={refreshOnboardingMutation.isPending}
              >
                {refreshOnboardingMutation.isPending ? (
                  "Loading..."
                ) : (
                  <>
                    Continue Setup
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );

      case "verified":
        return (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Account Connected</AlertTitle>
            <AlertDescription className="text-green-700">
              Your Stripe account is verified and ready to receive payments.
              Payouts will be automatically transferred to your bank account.
            </AlertDescription>
          </Alert>
        );

      case "rejected":
        return (
          <Card className="mb-6 border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center">
                <XCircle className="mr-2 h-5 w-5 text-red-500" />
                Account Verification Failed
              </CardTitle>
              <CardDescription>
                There was an issue verifying your account. This could be due to incomplete or incorrect information.
                Please try again with accurate details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-muted rounded-md text-sm">
                <p>Status: {stripeStatusQuery.data?.status}</p>
                {stripeStatusQuery.error && (
                  <p className="text-red-500 mt-1">Error: {(stripeStatusQuery.error as Error).message}</p>
                )}
                {connectWithStripeMutation.error && (
                  <p className="text-red-500 mt-1">Connection Error: {(connectWithStripeMutation.error as Error).message}</p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  console.log("Retrying Stripe Connect...");
                  connectWithStripeMutation.mutate();
                }}
                disabled={connectWithStripeMutation.isPending}
                variant="destructive"
              >
                {connectWithStripeMutation.isPending ? (
                  "Processing..."
                ) : (
                  <>
                    Try Again
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      default:
        return null;
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

  // Add this function to render balance information
  const renderBalanceInfo = () => {
    if (!balance || balanceLoading) return null;

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Available Balance</CardTitle>
          <CardDescription>
            Your current balance and pending payouts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-background border">
              <div className="text-sm text-muted-foreground">Available</div>
              <div className="text-2xl font-bold">
                {formatPrice(balance.available[0]?.amount || 0)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-background border">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-2xl font-bold">
                {formatPrice(balance.pending[0]?.amount || 0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Add this function to render payout schedule
  const renderPayoutSchedule = () => {
    if (!payoutSchedule || scheduleLoading) return null;

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Payout Schedule</CardTitle>
          <CardDescription>
            Your current payout settings and schedule
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Frequency</span>
              <span className="font-medium capitalize">{payoutSchedule.interval}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Next Payout</span>
              <span className="font-medium">
                {payoutSchedule.next_payout_date
                  ? formatDistanceToNow(new Date(payoutSchedule.next_payout_date * 1000), { addSuffix: true })
                  : 'Automatic'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };


  // Show loading state while data is being fetched
  if (auctionsLoading || bidsLoading || payoutsLoading || stripeStatusQuery.isLoading || scheduleLoading || balanceLoading || stripePayoutsLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading your dashboard...</div>
      </div>
    );
  }

  useEffect(() => {
    // Handle return from Stripe onboarding
    if (searchParams.get('onboarding_complete') === 'true') {
      toast({
        title: "Onboarding Status",
        description: "Checking your Stripe account status...",
        variant: "default",
      });
      // Refresh the stripe status
      stripeStatusQuery.refetch();
    }

    // Handle refresh onboarding parameter
    if (searchParams.get('refresh_onboarding') === 'true') {
      refreshOnboardingMutation.mutate();
    }
  }, [searchParams, stripeStatusQuery, refreshOnboardingMutation, toast]);

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

          {stripeStatusQuery.data?.status === "verified" && (
            <>
              {renderBalanceInfo()}
              {renderPayoutSchedule()}

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Recent Payouts</h3>
                {stripePayoutsLoading ? (
                  <div className="text-center">Loading your payouts...</div>
                ) : !stripePayouts?.data.length ? (
                  <div className="text-center text-muted-foreground">
                    No payouts found. Completed payments will appear here.
                  </div>
                ) : (
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
                            Expected Arrival
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-popover divide-y divide-border">
                        {stripePayouts.data.map((payout) => (
                          <tr key={payout.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {formatDistanceToNow(new Date(payout.created * 1000), { addSuffix: true })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {formatPrice(payout.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                ${payout.status === 'paid' ? 'bg-green-100 text-green-800' :
                                  payout.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  payout.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  'bg-blue-100 text-blue-800'}`}>
                                {payout.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                              {payout.arrival_date
                                ? formatDistanceToNow(new Date(payout.arrival_date * 1000), { addSuffix: true })
                                : 'Processing'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
          {stripeStatusQuery.data?.status === "rejected" && (
            <div className="text-center">
              <div className="text-destructive font-semibold mb-2">Account Verification Failed</div>
              <p className="text-sm text-muted-foreground mb-4">
                Your Stripe verification could not be completed. This may be due to missing information or verification issues.
              </p>
              <Button 
                onClick={() => {
                  toast({
                    title: "Reconnecting to Stripe",
                    description: "Please complete all required information in the Stripe form",
                    variant: "default",
                  });
                  connectWithStripeMutation.mutate();
                }} 
                disabled={connectWithStripeMutation.isPending}
              >
                {connectWithStripeMutation.isPending ? "Loading..." : "Try Again"}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SellerDashboard;