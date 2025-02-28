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
  const [isFormReady, setIsFormReady] = useState(false);
  const { toast } = useToast();
  const INSURANCE_FEE = 800; // $8.00 in cents

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: paymentData, refetch: refetchPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: !!auction,
  });

  // Handle insurance toggle
  useEffect(() => {
    if (!auction?.id) return;

    fetch(`/api/auctions/${auction.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ includeInsurance })
    })
    .then(response => {
      if (!response.ok) throw new Error('Failed to update payment details');
      return refetchPayment();
    })
    .catch(error => {
      console.error('Payment update error:', error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update payment details. Please try again.",
      });
    });
  }, [includeInsurance, auction?.id, refetchPayment, toast]);

  // Initialize Stripe Elements
  useEffect(() => {
    if (!paymentData?.clientSecret) return;

    let stripe: any;
    let elements: any;
    let mounted = true;

    const initializeStripe = async () => {
      try {
        // Load Stripe
        stripe = await stripePromise;
        if (!stripe || !mounted) return;

        // Clear existing elements
        const container = document.getElementById('payment-element');
        if (container) container.innerHTML = '';

        // Create Elements instance
        elements = stripe.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0F172A',
            },
          },
        });

        // Create and mount Payment Element
        const paymentElement = elements.create('payment');
        paymentElement.mount('#payment-element');

        // Listen for form ready state
        paymentElement.on('ready', () => {
          if (mounted) setIsFormReady(true);
        });

        // Listen for changes and errors
        paymentElement.on('change', (event: any) => {
          if (!mounted) return;
          if (event.error) {
            setIsFormReady(false);
            toast({
              variant: "destructive",
              title: "Form Error",
              description: event.error.message,
            });
          } else {
            setIsFormReady(true);
          }
        });

      } catch (error) {
        console.error('Stripe initialization error:', error);
        if (mounted) {
          setIsFormReady(false);
          toast({
            variant: "destructive",
            title: "Setup Error",
            description: "Could not initialize payment form. Please refresh the page.",
          });
        }
      }
    };

    initializeStripe();

    return () => {
      mounted = false;
      if (elements) {
        const element = elements.getElement('payment');
        if (element) element.destroy();
      }
      setIsFormReady(false);
    };
  }, [paymentData?.clientSecret, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormReady || isProcessing) return;

    setIsProcessing(true);

    try {
      const stripe = await stripePromise;
      if (!stripe) throw new Error("Could not initialize payment");

      const { error } = await stripe.confirmPayment({
        elements: stripe.elements({
          clientSecret: paymentData?.clientSecret
        }),
        confirmParams: {
          return_url: `${window.location.origin}/auction/${auction?.id}`,
        },
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: error.message || "Could not process your payment.",
        });
      }
      // Successful payments will redirect to return_url
    } catch (err) {
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
              disabled={!isFormReady || isProcessing}
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