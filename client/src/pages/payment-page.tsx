
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

// Initialize Stripe
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

  // Create payment or update with insurance
  useEffect(() => {
    if (!auction?.id) return;

    fetch(`/api/auctions/${auction.id}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ includeInsurance })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to update payment details');
      }
      return refetchPayment();
    })
    .catch(error => {
      console.error('Error updating payment:', error);
      toast({
        variant: "destructive",
        title: "Payment Update Error",
        description: "Failed to update payment details. Please try again.",
      });
    });
  }, [includeInsurance, auction?.id, refetchPayment, toast]);

  // Initialize Stripe when client secret is available
  useEffect(() => {
    if (!paymentData?.clientSecret) return;
    
    let stripeInstance = null;
    let elementsInstance = null;
    let paymentElement = null;
    
    const initStripe = async () => {
      try {
        console.log("Initializing Stripe with client secret");
        
        // Load Stripe
        stripeInstance = await stripePromise;
        if (!stripeInstance) {
          console.error("Failed to load Stripe");
          return;
        }
        
        // Clean up DOM first
        const container = document.getElementById('payment-element');
        if (container) {
          container.innerHTML = '';
        }
        
        // Create Elements instance
        elementsInstance = stripeInstance.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0F172A',
            }
          }
        });
        
        // Create and mount Payment Element
        paymentElement = elementsInstance.create('payment');
        paymentElement.mount('#payment-element');
        
        // Listen for ready event
        paymentElement.on('ready', () => {
          console.log("Payment element is ready");
          setIsFormReady(true);
        });
        
        // Listen for change events
        paymentElement.on('change', (event) => {
          console.log("Payment element changed:", event.complete);
          setIsFormReady(event.complete);
        });
        
        window.stripeInstance = stripeInstance;
        window.elementsInstance = elementsInstance;
      } catch (error) {
        console.error("Error initializing Stripe:", error);
        toast({
          variant: "destructive",
          title: "Payment Setup Error",
          description: "Failed to initialize payment form. Please try again.",
        });
      }
    };
    
    initStripe();
    
    return () => {
      // Clean up on unmount
      if (paymentElement) {
        paymentElement.destroy();
      }
      setIsFormReady(false);
    };
  }, [paymentData?.clientSecret, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submit button clicked");
    
    // Access Stripe from window for debugging purposes
    const stripe = window.stripeInstance;
    const elements = window.elementsInstance;
    
    if (!stripe || !elements) {
      console.error("Stripe not initialized", { stripe, elements });
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "Payment system not initialized. Please reload the page.",
      });
      return;
    }
    
    if (!isFormReady || isProcessing) {
      console.log("Form not ready or already processing");
      return;
    }
    
    setIsProcessing(true);
    
    try {
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
      } else {
        console.log("Payment submitted successfully");
        // Success will redirect to return_url
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "An unexpected error occurred processing your payment.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoadingAuction || !auction || !paymentData) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Format currency for display
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

          <form id="payment-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 border rounded-lg min-h-[200px]">
              <div id="payment-element" className="min-h-[200px]" />
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
