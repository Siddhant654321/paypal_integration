import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, Search, DollarSign, ExternalLink, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Link, Redirect } from "wouter";
import AuctionCard from "@/components/auction-card";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
}

interface PayoutSchedule {
  delay_days: number;
  interval: string;
}

interface StripeConnectResponse {
  url: string;
  accountId: string;
}

const SellerDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  // Redirect if not a seller
  if (!user || user.role !== "seller") {
    return <Redirect to="/" />;
  }

  const { data: auctions, isLoading: auctionsLoading } = useQuery<Auction[]>({
    queryKey: ["/api/seller/auctions"],
    select: (data) => data || [],
  });

  const { data: stripeStatus, isLoading: stripeStatusLoading } = useQuery<StripeStatus>({
    queryKey: ["/api/seller/status"],
    retry: false,
  });

  const { data: balance } = useQuery<Balance>({
    queryKey: ["/api/seller/balance"],
    enabled: stripeStatus?.status === "verified",
  });

  const { data: payoutSchedule } = useQuery<PayoutSchedule>({
    queryKey: ["/api/seller/payout-schedule"],
    enabled: stripeStatus?.status === "verified",
  });

  // Connect with Stripe mutation
  const connectWithStripeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/seller/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to connect with Stripe');
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error('No onboarding URL received');
      }

      return data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe's hosted onboarding
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Error connecting to Stripe",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle return from Stripe onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const refresh = params.get('refresh');

    if (success === 'true' || refresh === 'true') {
      // Clean up URL parameters and reload to update status
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.reload();
    }
  }, []);

  // Filter auctions
  const filteredAuctions = auctions ? auctions.filter(auction => {
    const searchLower = searchTerm.toLowerCase();
    return auction.title?.toLowerCase().includes(searchLower) || 
           auction.description?.toLowerCase().includes(searchLower);
  }) : [];

  const pendingAuctions = filteredAuctions.filter(auction => !auction.approved);
  const approvedAuctions = filteredAuctions.filter(auction => auction.approved);
  const endedAuctions = filteredAuctions.filter(auction => auction.status === "ended");

  // Render account status section
  const renderAccountStatus = () => {
    if (stripeStatusLoading) {
      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Loading account status...</CardTitle>
          </CardHeader>
        </Card>
      );
    }

    switch (stripeStatus?.status) {
      case "not_started":
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Set Up Your Seller Account</CardTitle>
              <CardDescription>
                Before you can receive payments, you need to set up your account.
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
                    Set Up Payments Account
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
                Please complete all required information to finish setting up your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => connectWithStripeMutation.mutate()}
              >
                Continue Setup
              </Button>
            </CardContent>
          </Card>
        );

      case "verified":
        return (
          <>
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Account Connected</AlertTitle>
              <AlertDescription className="text-green-700">
                Your account is verified and ready to receive payments.
              </AlertDescription>
            </Alert>
            {balance && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Balance</CardTitle>
                  <CardDescription>Your current balance and pending payouts</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border">
                      <div className="text-sm text-muted-foreground">Available</div>
                      <div className="text-2xl font-bold">
                        {formatPrice(balance.available[0]?.amount || 0)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <div className="text-sm text-muted-foreground">Pending</div>
                      <div className="text-2xl font-bold">
                        {formatPrice(balance.pending[0]?.amount || 0)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {payoutSchedule && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Payout Schedule</CardTitle>
                  <CardDescription>When you'll receive your money</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frequency</span>
                      <span className="font-medium capitalize">{payoutSchedule.interval}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Processing Time</span>
                      <span className="font-medium">{payoutSchedule.delay_days} days</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
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
                There was an issue verifying your account. Please complete all required information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => connectWithStripeMutation.mutate()}
                variant="destructive"
              >
                Complete Required Information
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Set Up Your Seller Account</CardTitle>
              <CardDescription>
                Connect your account to receive payments for your auctions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => connectWithStripeMutation.mutate()}
              >
                Set Up Payments Account
              </Button>
            </CardContent>
          </Card>
        );
    }
  };

  // Loading state
  if (auctionsLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Seller Dashboard</h1>
        <Link href="/seller/new-auction">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create New Auction
          </Button>
        </Link>
      </div>

      {renderAccountStatus()}

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search auctions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="auctions">
        <TabsList>
          <TabsTrigger value="auctions">My Auctions</TabsTrigger>
          <TabsTrigger value="payments">
            <DollarSign className="w-4 h-4 mr-2" />
            Payments & Payouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auctions">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">
                Active ({approvedAuctions.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({pendingAuctions.length})
              </TabsTrigger>
              <TabsTrigger value="ended">
                Ended ({endedAuctions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {approvedAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="pending">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="ended">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {endedAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="payments">
          {stripeStatus?.status === "verified" ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Payouts</CardTitle>
                  <CardDescription>
                    View your recent payouts and payment history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center text-muted-foreground">
                    No payouts found yet. Completed payments will appear here.
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Complete your account setup to view payment information
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SellerDashboard;