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
import { formatPrice } from "../utils/formatters";

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
      const response = await fetch(`/api/auctions/${auction.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ includeInsurance })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create payment session');
      }

      // Get the Stripe checkout URL from the response
      const { url } = data;

      if (!url) {
        throw new Error("No checkout URL received");
      }

      // Open Stripe checkout in a new tab
      const checkoutWindow = window.open(url, '_blank');

      if (checkoutWindow) {
        toast({
          title: "Checkout Opened",
          description: "Complete your payment in the new tab."
        });
      } else {
        throw new Error("Pop-up was blocked. Please allow pop-ups and try again.");
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
    } finally {
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

  const baseAmountDollars = auction ? formatPrice(auction.currentPrice) : '-';
  const insuranceAmountDollars = formatPrice(INSURANCE_FEE);
  const totalAmountDollars = auction ? formatPrice(auction.currentPrice + (includeInsurance ? INSURANCE_FEE : 0)) : '-';

  return (
    <div className="container mx-auto py-8">
      <Link href={`/auction/${auction?.id}`}>
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
            {auction?.title}
          </div>

          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <span>Winning bid amount</span>
            <span className="font-medium">{baseAmountDollars}</span>
          </div>

          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <Shield className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Label htmlFor="insurance">Shipping Insurance</Label>
              <p className="text-sm text-muted-foreground">
                Add {insuranceAmountDollars} insurance to protect against shipping issues
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
            <span>{totalAmountDollars}</span>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button 
            onClick={handlePayment}
            className="w-full" 
            size="lg"
            disabled={isProcessing || !auction}
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