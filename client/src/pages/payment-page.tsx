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
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";

const INSURANCE_FEE = 800; // $8.00 in cents

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  // Initial PayPal script check
  useEffect(() => {
    if (!import.meta.env.VITE_PAYPAL_CLIENT_ID || import.meta.env.VITE_PAYPAL_CLIENT_ID === '${process.env.PAYPAL_CLIENT_ID}') {
      console.error("PayPal Client ID is missing or not properly resolved");
      setError("PayPal configuration is missing. Please contact support.");
      return;
    }
    console.log("[PayPal] SDK configuration ready with ID:", import.meta.env.VITE_PAYPAL_CLIENT_ID.substring(0, 5) + '...');
    setSdkReady(true);
  }, []);

  const createOrder = async () => {
    if (isProcessing || !auction?.id) return;

    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "Please log in to proceed with payment.",
      });
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log("[PayPal] Creating order for auction:", auction.id);

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
      console.log("[PayPal] Order created successfully:", data.orderId);
      return data.orderId;
    } catch (err) {
      console.error('[Payment] Error:', err);
      const errorMessage = err instanceof Error ? err.message : "Could not process your payment. Please try again.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: errorMessage,
      });
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const onApprove = async (data: { orderID: string }) => {
    try {
      console.log("[PayPal] Payment approved, capturing payment:", data.orderID);

      const response = await fetch(`/api/payments/${data.orderID}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to capture payment');
      }

      toast({
        title: "Payment Successful",
        description: "Your payment has been processed successfully.",
      });

      // Redirect to success page
      window.location.href = `/payment-success?order=${data.orderID}`;
    } catch (err) {
      console.error('[Payment] Capture error:', err);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "Failed to complete payment. Please contact support.",
      });
    }
  };

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

          {sdkReady ? (
            <PayPalScriptProvider options={{ 
              clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || '',
              currency: "USD",
              intent: "capture"
            }}>
              <PayPalButtons
                disabled={isProcessing}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={(err) => {
                  console.error('[PayPal] Error:', err);
                  setError("Payment failed. Please try again or contact support.");
                }}
                style={{ 
                  layout: "vertical",
                  color: "gold",
                  shape: "rect",
                  label: "pay"
                }}
              />
            </PayPalScriptProvider>
          ) : (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>Loading payment options...</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          Your payment will be processed securely through PayPal.
        </CardFooter>
      </Card>
    </div>
  );
}