
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Verify Stripe key is available and in test mode
if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Stripe publishable key is missing');
}

if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')) {
  throw new Error('Stripe publishable key must be a test mode key (starts with pk_test_)');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const INSURANCE_FEE = 800; // $8.00 in cents

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  useEffect(() => {
    // Check if Stripe is properly loaded and available
    const checkStripe = async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe) {
          setError("Stripe could not be initialized. Please refresh the page.");
        }
      } catch (err) {
        console.error("Stripe initialization error:", err);
        setError("Error initializing payment system.");
      }
    };
    
    checkStripe();
  }, []);
  
  const handlePayment = async () => {
    if (isProcessing || !auction?.id) return;
    
    // Clear any previous errors
    setError(null);

    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "Please log in to proceed with payment.",
      });
      setLocation('/auth');
      return;
    }

    setIsProcessing(true);

    try {
      console.log("Creating checkout session...");
      // Create checkout session
      const response = await fetch(`/api/auctions/${auction.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ includeInsurance })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.code === "AUTH_REQUIRED") {
          setLocation('/auth');
          throw new Error("Please log in to proceed with payment");
        }
        throw new Error(errorData.message || 'Failed to create payment session');
      }

      const { sessionId } = await response.json();
      console.log("Got session ID:", sessionId);

      // Initialize Stripe and redirect to checkout
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Could not initialize Stripe");
      }

      console.log("Redirecting to Stripe checkout...");
      // Open in a new tab using the correct Stripe checkout URL format
      const checkoutUrl = `https://checkout.stripe.com/pay/${sessionId}`;
      window.open(checkoutUrl, '_blank');
      
      // Show success message since we can't redirect back automatically
      toast({
        title: "Checkout opened in new tab",
        description: "Complete your payment in the new tab. You'll be redirected back after payment."
      });
      
      setIsProcessing(false);
      return; // Skip the error check below since we're not using redirectToCheckout

      if (error) {
        console.error("Stripe redirect error:", error);
        throw error;
      }
    } catch (err) {
      console.error('Payment error:', err);
      const errorMessage = err instanceof Error ? err.message : "Could not process your payment. Please try again.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: errorMessage,
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
              onCheckedChange={setIncludeInsurance}
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>${totalAmountDollars}</span>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
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
        <CardFooter className="text-sm text-muted-foreground">
          You will be redirected to Stripe to complete your payment securely.
        </CardFooter>
      </Card>
    </div>
  );
}
