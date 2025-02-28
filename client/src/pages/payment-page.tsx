
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

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

  const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
  const [isLoadingPayment, setIsLoadingPayment] = useState(true);

  // Fetch payment data
  useEffect(() => {
    if (!auction?.id) return;
    
    const fetchPayment = async () => {
      setIsLoadingPayment(true);
      try {
        const response = await axios.post(`/api/auctions/${auction.id}/pay`, {
          includeInsurance,
        });
        setPaymentData(response.data);
      } catch (error) {
        console.error("Failed to fetch payment data:", error);
        toast({
          variant: "destructive",
          title: "Payment Error",
          description: "Failed to set up payment. Please try again.",
        });
      } finally {
        setIsLoadingPayment(false);
      }
    };

    fetchPayment();
  }, [auction?.id, includeInsurance, toast]);

  // Initialize Stripe
  useEffect(() => {
    if (!paymentData?.clientSecret) return;
    
    let mounted = true;
    
    const initializeStripe = async () => {
      try {
        // Clear previous payment element
        const container = document.getElementById('payment-element');
        if (container) {
          container.innerHTML = '';
        }
        
        const stripe = await stripePromise;
        if (!stripe || !mounted) return;
        
        const elements = stripe.elements({
          clientSecret: paymentData.clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0F172A',
            },
          },
        });
        
        const paymentElement = elements.create('payment');
        paymentElement.mount('#payment-element');
        
        paymentElement.on('ready', () => {
          if (mounted) {
            console.log('Payment element is ready');
            setIsFormReady(true);
          }
        });
        
        // Store in window for debugging
        window.stripeElements = elements;
        window.stripeInstance = stripe;
      } catch (error) {
        console.error('Error initializing Stripe:', error);
        toast({
          variant: "destructive",
          title: "Payment Error",
          description: "Failed to initialize payment form. Please try again.",
        });
      }
    };
    
    // Reset form state
    setIsFormReady(false);
    
    // Initialize after a brief delay
    const timer = setTimeout(() => {
      initializeStripe();
    }, 500);
    
    return () => {
      mounted = false;
      clearTimeout(timer);
      
      // Clean up payment element on unmount
      const container = document.getElementById('payment-element');
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [paymentData?.clientSecret, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Submit button clicked');
    
    if (!paymentData?.clientSecret) {
      console.error('No client secret available');
      return;
    }
    
    if (isProcessing) {
      console.log('Already processing payment');
      return;
    }
    
    if (!isFormReady) {
      console.log('Form not ready yet');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const stripe = window.stripeInstance;
      const elements = window.stripeElements;
      
      if (!stripe || !elements) {
        console.error('Stripe not initialized');
        throw new Error('Payment system not initialized');
      }
      
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/auction/${auction?.id}`,
        },
      });
      
      if (error) {
        console.error('Payment confirmation error:', error);
        throw error;
      }
      
      // Success will redirect to return_url
      console.log('Payment submitted successfully');
    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        variant: "destructive",
        title: "Payment Failed",
        description: error.message || "Your payment could not be processed.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoadingAuction || isLoadingPayment) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!auction || !paymentData) {
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-red-500 mb-4">Failed to load payment information</p>
              <Link href={`/auction/${params?.id}`}>
                <Button>Return to Auction</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
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
              onCheckedChange={(checked) => {
                setIncludeInsurance(checked);
                setIsFormReady(false); // Reset form when insurance changes
              }}
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>${totalAmountDollars}</span>
          </div>

          <form id="payment-form" onSubmit={handleSubmit} className="space-y-4">
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
