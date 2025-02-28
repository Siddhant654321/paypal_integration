import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield } from "lucide-react";
import { useEffect, useState } from "react";
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
  clientSecret: string;
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
  const [isStripeReady, setIsStripeReady] = useState(false);
  const [isElementMounted, setIsElementMounted] = useState(false);
  const { toast } = useToast();
  const INSURANCE_FEE = 800; // $8.00 in cents

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: paymentData, refetch: refetchPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: !!auction,
  });

  // Initialize Stripe instance
  useEffect(() => {
    const initStripe = async () => {
      try {
        const stripe = await stripePromise;
        if (stripe) {
          console.log('Stripe loaded successfully');
          setIsStripeReady(true);
        } else {
          console.error('Failed to load Stripe');
          toast({
            variant: "destructive",
            title: "Payment Setup Error",
            description: "Could not initialize payment system. Please refresh the page.",
          });
        }
      } catch (error) {
        console.error('Error loading Stripe:', error);
        toast({
          variant: "destructive",
          title: "Payment Setup Error",
          description: "Could not initialize payment system. Please refresh the page.",
        });
      }
    };

    initStripe();
  }, [toast]);

  // Handle insurance toggle
  useEffect(() => {
    if (!auction?.id) return;

    const updatePayment = async () => {
      try {
        const response = await fetch(`/api/auctions/${auction.id}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ includeInsurance })
        });

        if (!response.ok) {
          throw new Error('Failed to update payment details');
        }

        await refetchPayment();
      } catch (error) {
        console.error('Payment update error:', error);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Could not update payment details. Please try again.",
        });
      }
    };

    updatePayment();
  }, [includeInsurance, auction?.id, refetchPayment, toast]);

  // Initialize payment element
  useEffect(() => {
    if (!isStripeReady || !paymentData?.clientSecret) {
      console.log('Waiting for Stripe and client secret...', {
        isStripeReady,
        hasClientSecret: !!paymentData?.clientSecret
      });
      return;
    }

    let mounted = true;
    const container = document.getElementById('payment-element');

    if (!container) {
      console.error('Payment element container not found');
      return;
    }

    const setupElement = async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe || !mounted) return;

        console.log('Creating Elements instance...');
        const elements = stripe.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0F172A',
            },
          },
        });

        console.log('Creating payment element...');
        const paymentElement = elements.create('payment');

        console.log('Mounting payment element...');
        paymentElement.mount(container);
        setIsElementMounted(true);
        console.log('Payment element mounted successfully');

        // Add event listeners
        paymentElement.on('ready', () => {
          if (mounted) {
            console.log('Payment element is ready');
            setIsElementMounted(true);
          }
        });

        paymentElement.on('change', (event: any) => {
          if (!mounted) return;
          console.log('Payment element change:', event);
          if (event.error) {
            toast({
              variant: "destructive",
              title: "Payment Form Error",
              description: event.error.message,
            });
          }
        });

        return () => {
          if (paymentElement) {
            console.log('Cleaning up payment element...');
            paymentElement.destroy();
          }
          setIsElementMounted(false);
        };
      } catch (error) {
        console.error('Failed to setup payment element:', error);
        toast({
          variant: "destructive",
          title: "Payment Setup Error",
          description: "Could not initialize payment form. Please refresh the page.",
        });
      }
    };

    const cleanup = setupElement();
    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [isStripeReady, paymentData?.clientSecret, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStripeReady || !isElementMounted || isProcessing) {
      console.log('Cannot process payment:', {
        isStripeReady,
        isElementMounted,
        isProcessing
      });
      return;
    }

    setIsProcessing(true);
    console.log('Processing payment...');

    try {
      const stripe = await stripePromise;
      if (!stripe || !paymentData?.clientSecret) {
        throw new Error("Payment system not initialized");
      }

      const { error } = await stripe.confirmPayment({
        elements: stripe.elements({
          clientSecret: paymentData.clientSecret,
        }),
        confirmParams: {
          return_url: `${window.location.origin}/auction/${auction?.id}`,
        },
      });

      if (error) {
        console.error('Payment error:', error);
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: error.message || "Could not process your payment.",
        });
      }
      // Successful payments will redirect to return_url
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

  if (isLoadingAuction || !auction) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
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
              onCheckedChange={setIncludeInsurance}
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>${totalAmountDollars}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 border rounded-lg min-h-[200px]">
              <div id="payment-element" />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              disabled={!isStripeReady || !isElementMounted || isProcessing}
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