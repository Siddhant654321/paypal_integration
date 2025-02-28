import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
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
  const [stripeElement, setStripeElement] = useState<any>(null);
  const { toast } = useToast();
  const INSURANCE_FEE = 800; // $8.00 in cents
  const paymentElementRef = useRef<HTMLDivElement>(null);

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
        credentials: 'include', // Include credentials for authentication
        body: JSON.stringify({ includeInsurance })
      }).then(() => refetchPayment());
    }
  }, [includeInsurance, auction?.id, refetchPayment]);

  // Initialize Stripe
  useEffect(() => {
    let mounted = true;

    const initializeStripe = async () => {
      if (!paymentData?.clientSecret || !paymentElementRef.current) return;

      try {
        const stripe = await stripePromise;
        if (!stripe || !mounted) return;

        // Create and mount the Payment Element
        const elements = stripe.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
          },
        });

        const paymentElement = elements.create('payment');
        if (mounted) {
          paymentElement.mount(paymentElementRef.current);
          setStripeElement(paymentElement);
        }

        return () => {
          if (paymentElement) {
            paymentElement.destroy();
          }
        };
      } catch (error) {
        console.error('Failed to initialize Stripe:', error);
        if (mounted) {
          toast({
            variant: "destructive",
            title: "Payment Setup Error",
            description: "Failed to initialize payment form. Please refresh and try again.",
          });
        }
      }
    };

    initializeStripe();

    return () => {
      mounted = false;
      if (stripeElement) {
        stripeElement.destroy();
      }
    };
  }, [paymentData?.clientSecret, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const stripe = await stripePromise;
      if (!stripe || !paymentData?.clientSecret) {
        throw new Error("Unable to process payment");
      }

      const { error } = await stripe.confirmPayment({
        elements: stripeElement,
        confirmParams: {
          return_url: `${window.location.origin}/auction/${auction?.id}`,
        },
      });

      if (error) {
        console.error('Payment confirmation error:', error);
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: error.message || "Unable to process your payment. Please try again.",
        });
      }
      // Success will redirect to return_url
    } catch (err) {
      console.error('Payment submission error:', err);
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
              disabled={isProcessing || !stripeElement}
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