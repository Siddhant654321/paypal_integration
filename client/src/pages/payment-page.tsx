import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@/lib/use-query";
import { useRoute } from "@/lib/use-route";
import { Auction } from "@/shared/schema";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Shield } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Load Stripe
import { loadStripe } from "@stripe/stripe-js";
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface PaymentResponse {
  clientSecret: string;
  payment: {
    amount: number;
    platformFee: number;
    sellerPayout: number;
  };
}

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const { toast } = useToast();
  const INSURANCE_FEE = 800; // $8.00 in cents
  const paymentElementRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: paymentData, isLoading: isLoadingPayment, refetch: refetchPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: !!auction,
  });

  // Update payment intent when insurance changes
  useEffect(() => {
    if (!auction || !paymentData) return;

    const updatePaymentIntent = async () => {
      try {
        await fetch(`/api/auctions/${auction.id}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeInsurance }),
        });
        refetchPayment();
      } catch (error) {
        console.error("Error updating payment intent:", error);
      }
    };

    updatePaymentIntent();
  }, [includeInsurance, auction?.id, refetchPayment]);

  // Format amounts for display
  const formatAmount = (amount: number) => (amount / 100).toFixed(2);
  const totalAmountDollars = paymentData ? formatAmount(paymentData.payment.amount) : "0.00";
  const platformFeeDollars = paymentData ? formatAmount(paymentData.payment.platformFee) : "0.00";
  const sellerPayoutDollars = paymentData ? formatAmount(paymentData.payment.sellerPayout) : "0.00";
  const insuranceAmountDollars = formatAmount(INSURANCE_FEE);

  // Initialize Stripe
  useEffect(() => {
    if (!paymentData?.clientSecret) return;

    let cleanup = () => {};
    const initializeStripe = async () => {
      try {
        console.log("Loading Stripe...");
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Failed to load Stripe");
        }
        stripeRef.current = stripe;
        console.log("Stripe loaded successfully");

        console.log("Creating Elements instance...");
        const elements = stripe.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0F172A',
            },
          },
        });
        elementsRef.current = elements;

        console.log("Creating and mounting Payment Element...");
        const paymentElement = elements.create('payment');
        if (paymentElementRef.current) {
          paymentElement.mount(paymentElementRef.current);
          setStripeReady(true);
          console.log("Payment Element mounted successfully");
        }

        cleanup = () => {
          console.log("Cleaning up Stripe elements...");
          paymentElement.destroy();
          elementsRef.current = null;
          stripeRef.current = null;
          setStripeReady(false);
        };
      } catch (error) {
        console.error("Stripe initialization error:", error);
        toast({
          variant: "destructive",
          title: "Payment Setup Error",
          description: "Failed to initialize payment form. Please refresh and try again.",
        });
        setStripeReady(false);
      }
    };

    initializeStripe();
    return () => cleanup();
  }, [paymentData?.clientSecret, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing || !stripeReady) return;
    setIsProcessing(true);

    try {
      const stripe = stripeRef.current;
      const elements = elementsRef.current;

      if (!stripe || !elements) {
        throw new Error("Payment system not initialized");
      }

      console.log("Confirming payment...");
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/auction/${auction?.id}`,
        },
      });

      if (error) {
        console.error("Payment error:", error);
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: error.message || "Your payment could not be processed.",
        });
      }
      // Success will redirect to return_url
    } catch (err) {
      console.error("Payment submission error:", err);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoadingAuction || isLoadingPayment) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <Card className="border-2 border-muted shadow-lg">
        <CardHeader className="border-b bg-muted/50">
          <CardTitle>Complete Your Purchase</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-medium">{auction?.title}</h3>
            <p className="text-sm text-muted-foreground">
              Winning bid: ${auction?.currentPrice ? (auction.currentPrice / 100).toFixed(2) : "0.00"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 border rounded-lg min-h-[200px]">
              <div ref={paymentElementRef} className="min-h-[40px]" />
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
                onCheckedChange={setIncludeInsurance}
              />
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between mb-2">
                <span>Base Amount</span>
                <span>${auction?.currentPrice ? (auction.currentPrice / 100).toFixed(2) : "0.00"}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Platform Fee</span>
                <span>${platformFeeDollars}</span>
              </div>
              {includeInsurance && (
                <div className="flex justify-between mb-2">
                  <span>Insurance</span>
                  <span>${insuranceAmountDollars}</span>
                </div>
              )}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span>${totalAmountDollars}</span>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              disabled={isProcessing || !stripeReady}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-5 w-5 mr-2" />
              )}
              {isProcessing ? "Processing..." : `Pay $${totalAmountDollars}`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}