import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { WinningBidderDetails } from "@/components/winning-bidder-details";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";


interface PayPalStatus {
  status: "not_started" | "pending" | "verified" | "rejected";
}

interface Balance {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
}

export const SellerDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);

  // Redirect if not a seller
  if (!user || (user.role !== "seller" && user.role !== "seller_admin")) {
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

  const { data: paypalStatus, isLoading: paypalStatusLoading, refetch: refetchPayPalStatus } = useQuery({
    queryKey: ["/api/seller/status"],
    retry: 3,
    retryDelay: 1000,
    refetchInterval: (data) => data?.status === "pending" ? 5000 : false,
  });

  const { data: balance, refetch: refetchBalance } = useQuery({
    queryKey: ["/api/seller/balance"],
    enabled: paypalStatus?.status === "verified",
  });

  // Enhanced check for PayPal success return
  useEffect(() => {
    const checkPayPalStatus = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get('success');
      const refresh = urlParams.get('refresh');

      if (success === 'true' || refresh === 'true') {
        console.log("[Seller Dashboard] PayPal redirect detected, checking account status...");

        // Clear the query params first
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

        try {
          // Force refetch both status and balance
          const [statusResult] = await Promise.all([
            refetchPayPalStatus(),
            refetchBalance()
          ]);

          console.log("[Seller Dashboard] Refetched status:", statusResult.data);

          if (statusResult.data?.status === "verified") {
            toast({
              title: "Account Verified",
              description: "Your PayPal account has been successfully verified!",
              variant: "default",
            });
          } else if (statusResult.data?.status === "rejected") {
            toast({
              title: "Account Verification Failed",
              description: "Your PayPal account verification was not successful. Please try again or contact support.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Account Status Updated",
              description: "Please complete any remaining verification steps if required.",
            });
          }
        } catch (error) {
          console.error("[Seller Dashboard] Error checking PayPal status:", error);
          toast({
            title: "Error",
            description: "Failed to check account status. Please refresh the page.",
            variant: "destructive",
          });
        }
      }
    };

    checkPayPalStatus();
  }, []);

  // Connect with PayPal mutation
  const connectWithPayPalMutation = useMutation({
    mutationFn: async () => {
      try {
        console.log("Starting PayPal Connect process...");
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
              console.error("PayPal Connect error:", errorData);
              throw new Error(errorData.message || "Failed to connect with PayPal");
            } catch (parseError) {
              console.error("Error parsing JSON response:", parseError);
              throw new Error(`Failed to connect with PayPal. Status: ${response.status}`);
            }
          } else {
            const text = await response.text();
            console.error("Non-JSON error response:", text.substring(0, 200) + "...");
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
        }

        const data = await response.json();
        console.log("PayPal Connect response:", data);

        if (!data.url) {
          console.error("No URL in response:", data);
          throw new Error('No URL received from PayPal Connect');
        }

        return data.url;
      } catch (error) {
        console.error("PayPal Connect error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Successfully got PayPal Connect URL:", data.substring(0, 30) + "...");
      window.open(data, '_blank', 'noopener,noreferrer');

      toast({
        title: "PayPal Connect",
        description: "PayPal onboarding page opened in a new tab. Please complete the setup there.",
      });
    },
    onError: (error: Error) => {
      console.error("PayPal connection error:", error);
      toast({
        title: "Error connecting to PayPal",
        description: error.message || "Failed to connect with PayPal. Please try again later.",
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

  const now = new Date();
  const activeAuctions = filteredAuctions.filter(auction =>
    auction.status === "active" && auction.approved && new Date(auction.endDate) > now
  );
  const completedAuctions = filteredAuctions.filter(auction =>
    auction.status === "ended" || new Date(auction.endDate) <= now
  );
  const pendingAuctions = filteredAuctions.filter(auction => !auction.approved);

  // Add new handler for viewing winner details
  const handleViewWinner = (auction: Auction) => {
    setSelectedAuction(auction);
  };

  // Render account status section
  const renderAccountStatus = () => {
    if (paypalStatusLoading) {
      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Loading account status...</CardTitle>
          </CardHeader>
        </Card>
      );
    }

    switch (paypalStatus?.status) {
      case "not_started":
      case "rejected":
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Set Up Your Seller Account</CardTitle>
              <CardDescription>
                Before you can receive payments, you need to set up your PayPal account.
                This process will allow you to receive payments directly to your bank account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-medium">What you'll need:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>A PayPal Business account (or ability to create one)</li>
                  <li>Your bank account information</li>
                  <li>Your business information (if applicable)</li>
                </ul>
              </div>
              <Button
                className="w-full"
                onClick={() => connectWithPayPalMutation.mutate()}
                disabled={connectWithPayPalMutation.isPending}
              >
                {connectWithPayPalMutation.isPending ? (
                  "Setting up..."
                ) : (
                  <>
                    Set Up PayPal Account
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
                Please complete all required information to finish setting up your PayPal account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => connectWithPayPalMutation.mutate()}
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
                Your PayPal account is verified and ready to receive payments.
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
          </>
        );

      default:
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Set Up Your Seller Account</CardTitle>
              <CardDescription>
                Connect your PayPal account to receive payments for your auctions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => connectWithPayPalMutation.mutate()}
              >
                Set Up PayPal Account
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
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
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
          <TabsTrigger value="payouts">Payouts</TabsTrigger> {/* Added Payouts Tab */}
        </TabsList>

        <TabsContent value="auctions">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">
                Active ({activeAuctions.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({pendingAuctions.length})
              </TabsTrigger>
              <TabsTrigger value="ended">
                Ended ({completedAuctions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeAuctions.map((auction) => (
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
                {completedAuctions.map((auction) => (
                  <div key={auction.id} className="space-y-4">
                    <AuctionCard auction={auction} />
                    {auction.winningBidderId && (
                      <Button
                        onClick={() => handleViewWinner(auction)}
                        className="w-full"
                        variant="outline"
                      >
                        View Winner Details & Submit Tracking
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Winner Details Dialog */}
              <Dialog
                open={!!selectedAuction}
                onOpenChange={(open) => !open && setSelectedAuction(null)}
              >
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Winner Details & Fulfillment</DialogTitle>
                    <DialogDescription>
                      View the winning bidder's details and submit tracking information to receive your payout.
                    </DialogDescription>
                  </DialogHeader>
                  {selectedAuction && (
                    <WinningBidderDetails
                      auctionId={selectedAuction.id}
                      onSuccess={() => {
                        setSelectedAuction(null);
                        queryClient.invalidateQueries({ queryKey: ["/api/seller/auctions"] });
                        toast({
                          title: "Success",
                          description: "Tracking information submitted successfully. Your payout will be processed shortly.",
                        });
                      }}
                    />
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="payments">
          {paypalStatus?.status === "verified" ? (
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
              Complete your PayPal account setup to view payment information
            </div>
          )}
        </TabsContent>
        <TabsContent value="payouts"> {/* Added Payouts Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payouts</CardTitle>
                <CardDescription>View your payouts</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Add your payout information here */}
                <div className="text-center text-muted-foreground">
                  No payouts found yet.  Completed payouts will appear here.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SellerDashboard;