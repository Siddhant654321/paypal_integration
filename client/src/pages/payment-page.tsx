import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Initialize Stripe with the publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

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

  // Use the paymentData query with proper credentials
  const { data: paymentData, refetch: refetchPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: !!auction?.id,
  });

  // Update payment when insurance option changes
  useEffect(() => {
    if (auction?.id) {
      apiRequest('POST', `/api/auctions/${auction.id}/pay`, { includeInsurance })
        .then(() => refetchPayment())
        .catch((error) => {
          console.error('Payment update error:', error);
          toast({
            variant: "destructive",
            title: "Payment Update Error",
            description: "Failed to update payment details. Please try again.",
          });
        });
    }
  }, [includeInsurance, auction?.id, refetchPayment, toast]);

  // Initialize Stripe Elements
  useEffect(() => {
    let cleanup = () => {};

    const initializeStripe = async () => {
      if (!paymentData?.clientSecret) {
        console.log("Waiting for payment intent client secret...");
        return;
      }

      if (!paymentElementRef.current) {
        console.log("Payment element container not ready...");
        return;
      }

      try {
        console.log("Loading Stripe...");
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Failed to load Stripe");
        }
        stripeRef.current = stripe;

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

        console.log("Creating Payment Element...");
        const paymentElement = elements.create('payment');
        paymentElement.mount(paymentElementRef.current);
        setStripeReady(true);
        console.log("Payment Element mounted successfully");

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
    if (!stripeRef.current || !elementsRef.current || isProcessing || !stripeReady) {
      return;
    }

    setIsProcessing(true);

    try {
      console.log("Confirming payment...");
      const { error } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
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

  if (isLoadingAuction) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex justify-center items-center min-h-screen text-muted-foreground">
        Auction not found
      </div>
    );
  }

  // Convert cents to dollars for display only
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
              onCheckedChange={setIncludeInsurance}
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>${totalAmountDollars}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 border rounded-lg min-h-[200px]">
              <div ref={paymentElementRef} className="min-h-[40px]" />
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
              {isProcessing ? "Processing..." : "Pay Now"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}