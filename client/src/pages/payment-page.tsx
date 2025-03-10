
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { AlertCircle, ArrowLeft, CheckCircle, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Checkbox } from "../components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LoadingSpinner } from "../components/loading-spinner";
import { formatCurrency } from "../lib/utils";
import { api } from "../lib/api";

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);

  // Fetch auction details
  const { data: auction, isLoading: auctionLoading, error: auctionError } = useQuery({
    queryKey: ["auction", id],
    queryFn: () => api.get(`/auctions/${id}`).then(res => res.data),
    enabled: !!id
  });

  // Initial PayPal script check
  useEffect(() => {
    const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!paypalClientId || paypalClientId === '${process.env.PAYPAL_CLIENT_ID}') {
      console.error("PayPal Client ID is missing or not properly resolved");
      setError("PayPal configuration is missing. Please contact support.");
      return;
    }
    console.log("[PayPal] SDK configuration ready with Client ID:", paypalClientId.substring(0, 5) + '...');
    setSdkReady(true);
  }, []);

  // Create PayPal order mutation
  const createPaymentMutation = useMutation({
    mutationFn: () => {
      console.log("[PAYMENT] Creating payment session for auction", id);
      return api.post(`/auctions/${id}/pay`, { includeInsurance });
    },
    onSuccess: (data) => {
      console.log("[PAYMENT] Payment session created successfully:", data.data);
      if (data.data.url) {
        // Redirect to PayPal checkout
        window.location.href = data.data.url;
      } else if (data.data.orderId) {
        setPaypalOrderId(data.data.orderId);
      }
    },
    onError: (error: any) => {
      console.error("[PAYMENT] Error creating payment session:", error);
      const errorMessage = error.response?.data?.message || "Failed to create payment session";
      setError(errorMessage);
    }
  });

  const capturePaymentMutation = useMutation({
    mutationFn: (orderId: string) => {
      console.log("[PAYMENT] Capturing payment for order", orderId);
      return api.post(`/payments/${orderId}/capture`);
    },
    onSuccess: () => {
      console.log("[PAYMENT] Payment captured successfully");
      navigate(`/payment-success?auction=${id}`);
    },
    onError: (error: any) => {
      console.error("[PAYMENT] Error capturing payment:", error);
      const errorMessage = error.response?.data?.message || "Failed to complete payment";
      setError(errorMessage);
    }
  });

  // Handle payment initiation
  const handleInitiatePayment = () => {
    if (!acceptedTerms) {
      setError("Please accept the terms and conditions before proceeding.");
      return;
    }
    createPaymentMutation.mutate();
  };

  // Calculate totals
  const calculateTotals = () => {
    if (!auction) return { subtotal: 0, platformFee: 0, insurance: 0, total: 0 };

    const subtotal = auction.currentPrice;
    const platformFee = Math.round(subtotal * 0.10); // 10% platform fee
    const insurance = includeInsurance ? 800 : 0; // $8.00 insurance fee
    const total = subtotal + platformFee + insurance;

    return { subtotal, platformFee, insurance, total };
  };

  const { subtotal, platformFee, insurance, total } = calculateTotals();

  // Render loading state
  if (auctionLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 flex flex-col items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-muted-foreground">Loading payment details...</p>
      </div>
    );
  }

  // Render error state
  if (auctionError || !auction) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load auction details. Please try again later.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  // Check if user is the winning bidder
  if (auction?.winningBidderId !== (window as any).USER_ID) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unauthorized</AlertTitle>
          <AlertDescription>
            Only the winning bidder can access the payment page.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate(`/auction/${id}`)} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Auction
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <Button variant="outline" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Left Column - Auction Summary */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Complete Your Purchase</CardTitle>
              <CardDescription>
                You're about to complete your winning bid for the following auction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex gap-4 items-start">
                  <div className="h-24 w-24 rounded-md overflow-hidden flex-shrink-0">
                    <img 
                      src={auction.imageUrl} 
                      alt={auction.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">{auction.title}</h3>
                    <p className="text-muted-foreground text-sm">Auction #{auction.id}</p>
                    <div className="mt-2">
                      <span className="font-medium">Winning Bid: </span>
                      <span className="text-lg">{formatCurrency(auction.currentPrice)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Item Total</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Platform Fee (10%)</span>
                  <span>{formatCurrency(platformFee)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Insurance {includeInsurance ? "" : "(not selected)"}</span>
                  <span>{formatCurrency(insurance)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                    <Label htmlFor="insurance" className="font-medium">Add Shipping Insurance</Label>
                  </div>
                  <Switch
                    id="insurance"
                    checked={includeInsurance}
                    onCheckedChange={setIncludeInsurance}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  For just $8.00, protect your purchase against damage, loss, or theft during shipping.
                </p>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="terms" 
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Accept Terms and Conditions
                  </label>
                  <p className="text-sm text-muted-foreground">
                    I agree to the <a href="/terms" className="text-primary underline">terms of service</a> and payment conditions.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col">
              {error && (
                <Alert variant="destructive" className="mb-4 w-full">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Payment Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {sdkReady && (
                <div className="w-full space-y-4">
                  <Button 
                    className="w-full"
                    disabled={!acceptedTerms || createPaymentMutation.isPending}
                    onClick={handleInitiatePayment}
                  >
                    {createPaymentMutation.isPending ? (
                      <>
                        <LoadingSpinner className="mr-2 h-4 w-4" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Pay {formatCurrency(total)}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Right Column - Payment Safety */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Payment Safety</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Secure Transaction</h4>
                  <p className="text-sm text-muted-foreground">Your payment information is processed securely.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Buyer Protection</h4>
                  <p className="text-sm text-muted-foreground">We hold payment until you confirm receipt of your item in good condition.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Verified Seller</h4>
                  <p className="text-sm text-muted-foreground">All sellers are verified before listing on our platform.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
