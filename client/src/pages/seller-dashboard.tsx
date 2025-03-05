import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, Search, DollarSign, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link, Redirect } from "wouter";
import AuctionCard from "@/components/auction-card";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPrice } from '../utils/formatters';
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

const SellerDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  console.log("[SellerDashboard] Rendering with user:", {
    isAuthenticated: !!user,
    role: user?.role,
    id: user?.id
  });

  // Redirect if not a seller
  if (!user || (user.role !== "seller" && user.role !== "seller_admin")) {
    console.log("[SellerDashboard] User not authorized, redirecting");
    return <Redirect to="/" />;
  }

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const { data: auctions, isLoading: auctionsLoading } = useQuery<Auction[]>({
    queryKey: ["/api/seller/auctions"],
    select: (data) => data || [],
  });

  // Enhanced Stripe status query with better error handling and retry logic
  const { data: stripeStatus, isLoading: stripeStatusLoading, refetch: refetchStripeStatus } = useQuery<StripeStatus>({
    queryKey: ["/api/seller/status"],
    retry: 3,
    retryDelay: 1000,
    refetchInterval: (data) => {
      console.log("[SellerDashboard] Current Stripe status:", data?.status);
      return data?.status === "pending" ? 5000 : false;
    },
    onError: (error) => {
      console.error("[SellerDashboard] Error fetching Stripe status:", error);
    }
  });

  const { data: balance } = useQuery<Balance>({
    queryKey: ["/api/seller/balance"],
    enabled: stripeStatus?.status === "verified",
  });

  const { data: payoutSchedule } = useQuery<PayoutSchedule>({
    queryKey: ["/api/seller/payout-schedule"],
    enabled: stripeStatus?.status === "verified",
  });

  // Enhanced check for Stripe success return
  useEffect(() => {
    const checkStripeStatus = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get('success');
      const refresh = urlParams.get('refresh');

      console.log("[SellerDashboard] URL params:", {
        success,
        refresh,
        pathname: window.location.pathname,
        search: window.location.search
      });

      if (success === 'true' || refresh === 'true') {
        console.log("[SellerDashboard] Stripe redirect detected, checking account status...");

        // Clear the query params first
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

        // Wait a moment before checking status
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          // Force refetch the seller status
          console.log("[SellerDashboard] Initiating status refetch");
          const result = await refetchStripeStatus();
          console.log("[SellerDashboard] Refetched status:", result.data);

          if (result.data?.status === "verified") {
            toast({
              title: "Account Verified",
              description: "Your Stripe account has been successfully verified!",
              variant: "default",
            });
          } else if (result.data?.status === "pending") {
            toast({
              title: "Account Setup In Progress",
              description: "Your account is being set up. Please complete any remaining verification steps.",
            });
          } else {
            toast({
              title: "Account Status Updated",
              description: "Your Stripe onboarding information has been received.",
            });
          }
        } catch (error) {
          console.error("[SellerDashboard] Error checking stripe status:", error);

          // Retry once after a short delay
          setTimeout(async () => {
            try {
              const retryResult = await refetchStripeStatus();
              console.log("[SellerDashboard] Retry status check:", retryResult.data);
              toast({
                title: "Account Status Updated",
                description: "Your Stripe account information has been received.",
              });
            } catch (retryError) {
              console.error("[SellerDashboard] Retry failed:", retryError);
              toast({
                title: "Connection Issue",
                description: "Account connected but unable to verify current status. Please refresh the page.",
                variant: "destructive",
              });
            }
          }, 2000);
        }
      }
    };

    checkStripeStatus();
  }, []);

  // Connect with Stripe mutation
  const connectWithStripeMutation = useMutation({
    mutationFn: async () => {
      try {
        console.log("[SellerDashboard] Starting Stripe Connect process...");
        const response = await fetch("/api/seller/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            try {
              const errorData = await response.json();
              console.error("[SellerDashboard] Stripe Connect error:", errorData);
              throw new Error(errorData.message || "Failed to connect with Stripe");
            } catch (parseError) {
              console.error("[SellerDashboard] Error parsing JSON response:", parseError);
              throw new Error(`Failed to connect with Stripe. Status: ${response.status}`);
            }
          } else {
            const text = await response.text();
            console.error("[SellerDashboard] Non-JSON error response:", text.substring(0, 200) + "...");
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
        }

        const data = await response.json();
        console.log("[SellerDashboard] Stripe Connect response:", data);

        if (!data.url) {
          console.error("[SellerDashboard] No URL in response:", data);
          throw new Error('No URL received from Stripe Connect');
        }

        return data.url;
      } catch (error) {
        console.error("[SellerDashboard] Stripe Connect error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("[SellerDashboard] Successfully got Stripe Connect URL:", data.substring(0, 30) + "...");
      window.open(data, '_blank', 'noopener,noreferrer');

      toast({
        title: "Stripe Connect",
        description: "Stripe onboarding page opened in a new tab. Please complete the setup there.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error connecting to Stripe",
        description: error.message,
        variant: "destructive",
      });
    }
  });

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
      case "rejected":
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
                <ExternalLink className="ml-2 h-4 w-4" />
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
                <ExternalLink className="ml-2 h-4 w-4" />
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
        <Link href="/seller/auction/new">
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