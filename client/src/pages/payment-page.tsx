import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Verify Stripe key is available
if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Stripe publishable key is missing');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface PaymentResponse {
  sessionId: string;
  payment: {
    amount: number;
    platformFee: number;
    sellerPayout: number;
    insuranceFee: number;
  };
}

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const INSURANCE_FEE = 800; // $8.00 in cents

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: paymentData, refetch: refetchPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: false, // Don't fetch automatically
  });

  // Initialize payment session
  const initializePayment = async () => {
    try {
      const response = await fetch(`/api/auctions/${params?.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ includeInsurance })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to initialize payment');
      }

      await refetchPayment();
    } catch (error) {
      console.error('Payment initialization error:', error);
      toast({
        variant: "destructive",
        title: "Payment Setup Failed",
        description: error instanceof Error ? error.message : "Could not setup payment. Please try again.",
      });
    }
  };

  // Handle insurance toggle
  const handleInsuranceToggle = async (checked: boolean) => {
    setIncludeInsurance(checked);
    await initializePayment();
  };

  // Handle payment submission
  const handlePayment = async () => {
    if (isProcessing || !auction?.id) return;

    setIsProcessing(true);

    try {
      // First initialize/update the payment session
      await initializePayment();

      // Then redirect to Stripe Checkout
      const stripe = await stripePromise;
      if (!stripe || !paymentData?.sessionId) {
        throw new Error("Payment system not initialized");
      }

      const { error } = await stripe.redirectToCheckout({
        sessionId: paymentData.sessionId,
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      console.error("Payment error:", err);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "Could not process your payment. Please try again.",
      });
      setIsProcessing(false);
    }
  };

  if (isLoadingAuction || !auction) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const baseAmountDollars = (auction.currentPrice / 100).toFixed(2);
  const insuranceAmountDollars = (INSURANCE_FEE / 100).toFixed(2);
  const totalAmountDollars = ((auction.currentPrice + (includeInsurance ? INSURANCE_FEE : 0)) / 100).toFixed(2);

  return (
    <div className="container mx-auto py-8">
      <Link href={`/auction/${auction.id}`}>
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Auction
        </Button>
      </Link>

      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Complete Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-lg font-medium">
            {auction.title}
          </div>

          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <span>Winning bid amount</span>
            <span className="font-medium">${baseAmountDollars}</span>
          </div>

          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <Shield className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Label htmlFor="insurance">Shipping Insurance</Label>
              <p className="text-sm text-muted-foreground">
                Add ${insuranceAmountDollars} insurance to protect against shipping issues
              </p>
            </div>
            <Switch
              id="insurance"
              checked={includeInsurance}
              onCheckedChange={handleInsuranceToggle}
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>${totalAmountDollars}</span>
          </div>

          <Button 
            onClick={handlePayment}
            className="w-full" 
            size="lg"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <CreditCard className="h-5 w-5 mr-2" />
            )}
            {isProcessing ? "Processing..." : "Proceed to Payment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}