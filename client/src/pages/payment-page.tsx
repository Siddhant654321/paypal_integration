import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Shield, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatPrice } from "../utils/formatters";
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Missing required env var: VITE_STRIPE_PUBLISHABLE_KEY');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const INSURANCE_FEE = 800; // $8.00 in cents

function CheckoutForm({ clientSecret, auctionId }: { clientSecret: string; auctionId: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      console.error("Stripe not initialized");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        throw new Error(submitError.message);
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
      });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      setError(message);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button 
        type="submit"
        className="w-full" 
        size="lg"
        disabled={isProcessing || !stripe}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5 mr-2" />
            Pay Now
          </>
        )}
      </Button>
    </form>
  );
}

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
    staleTime: Infinity, // Prevent unnecessary refetches
  });

  useEffect(() => {
    if (!auction?.id || !user) return;

    const createPaymentIntent = async () => {
      if (clientSecret) return; // Don't create new intent if we already have one

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/auctions/${auction.id}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ includeInsurance })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create payment session');
        }

        const data = await response.json();

        // Check if we got a redirect URL
        if (data.url) {
          console.log("Redirecting to Stripe Checkout:", data.url);
          // Use window.top to break out of iframe
          if (window.top) {
            window.top.location.href = data.url;
          } else {
            // Fallback to regular redirect
            window.location.href = data.url;
          }
          return;
        } else if (data.clientSecret) {
          // Fall back to client-side handling if we got a client secret instead
          setClientSecret(data.clientSecret);
        } else {
          throw new Error("No payment URL or client secret received");
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not initialize payment";
        setError(message);
        toast({
          variant: "destructive",
          title: "Payment Error",
          description: message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    createPaymentIntent();
  }, [auction?.id, includeInsurance, user, toast, clientSecret]);

  if (isLoadingAuction || !auction) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const baseAmountDollars = formatPrice(auction.currentPrice);
  const insuranceAmountDollars = formatPrice(INSURANCE_FEE);
  const totalAmountDollars = formatPrice(auction.currentPrice + (includeInsurance ? INSURANCE_FEE : 0));

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
              disabled={!!clientSecret} // Prevent changes after intent creation
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>{totalAmountDollars}</span>
          </div>

          {clientSecret ? (
            <Elements stripe={stripePromise} options={{ 
              clientSecret,
              appearance: { theme: 'stripe' }
            }}>
              <CheckoutForm clientSecret={clientSecret} auctionId={auction.id} />
            </Elements>
          ) : isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          Payments are processed securely by Stripe
        </CardFooter>
      </Card>
    </div>
  );
}