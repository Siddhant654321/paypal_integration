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
  const { toast } = useToast();
  const INSURANCE_FEE = 800; // $8.00 in cents
  const cardElementRef = useRef(null);
  const elementsRef = useRef(null);

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: paymentData, isLoading: isLoadingPayment, refetch: refetchPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: !!auction,
  });

  // Refetch payment data when insurance option changes
  useEffect(() => {
    if (auction?.id) {
      fetch(`/api/auctions/${auction.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ includeInsurance })
      }).then(() => refetchPayment());
    }
  }, [includeInsurance, auction?.id, refetchPayment]);

  useEffect(() => {
    let cleanup = () => {};

    const initializeStripe = async () => {
      if (!paymentData?.clientSecret) {
        console.log("No client secret available yet");
        return;
      }

      try {
        console.log("Loading Stripe...");
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Failed to load Stripe - publishable key may be missing");
        }
        console.log("Stripe loaded successfully");

        console.log("Creating Stripe Elements...");
        const elements = stripe.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
          },
        });
        elementsRef.current = elements;

        console.log("Creating card element...");
        const cardElement = elements.create('card');
        cardElementRef.current = cardElement;

        console.log("Mounting card element...");
        cardElement.mount('#card-element');

        // Add event listener for card element changes
        cardElement.on('change', (event) => {
          if (event.error) {
            toast({
              variant: "destructive",
              title: "Card Error",
              description: event.error.message,
            });
          }
        });

        cleanup = () => {
          console.log("Cleaning up Stripe elements...");
          if (cardElementRef.current) {
            cardElementRef.current.destroy();
            cardElementRef.current = null;
          }
          elementsRef.current = null;
        };

        console.log("Stripe initialization complete");
      } catch (error) {
        console.error("Error initializing Stripe:", error);
        toast({
          variant: "destructive",
          title: "Payment Setup Error",
          description: "Failed to initialize payment form. Please try again.",
        });
      }
    };

    initializeStripe();
    return () => cleanup();
  }, [paymentData?.clientSecret, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      console.log("Starting payment process...");
      const stripe = await stripePromise;

      if (!stripe) {
        throw new Error("Stripe not loaded");
      }
      if (!cardElementRef.current) {
        throw new Error("Card element not initialized");
      }
      if (!paymentData?.clientSecret) {
        throw new Error("No payment intent available");
      }

      console.log("Confirming card payment...");
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        paymentData.clientSecret,
        {
          payment_method: {
            card: cardElementRef.current,
          },
        }
      );

      if (error) {
        console.error("Payment error:", error);
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: error.message || "Your payment could not be processed.",
        });
      } else if (paymentIntent.status === 'succeeded') {
        console.log("Payment successful:", paymentIntent);
        toast({
          title: "Payment Successful",
          description: "Your payment has been processed successfully.",
        });
      }
    } catch (err) {
      console.error("Payment submission error:", err);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "An unexpected error occurred while processing your payment.",
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
            <div className="p-4 border rounded-lg">
              <div id="card-element" className="min-h-[40px]" />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-5 w-5 mr-2" />
              )}
              {isProcessing ? "Processing..." : "Pay with Stripe"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}