import React, { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useAuction } from '../hooks/use-auction';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertCircle, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { LoadingSpinner } from '../components/loading-spinner';
import { Shield } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

const PLATFORM_FEE_PERCENTAGE = 0.05; // 5%
const INSURANCE_FEE = 800; // $8.00 in cents

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const auctionId = parseInt(id || "0");
  const { data: auction, isLoading: isAuctionLoading } = useAuction(auctionId);
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate payment amounts
  const baseAmount = auction?.currentPrice || 0;
  const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
  const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
  const totalAmount = baseAmount + platformFee + insuranceFee;

  // Format amounts for display
  const baseAmountDollars = formatCurrency(baseAmount);
  const platformFeeDollars = formatCurrency(platformFee);
  const insuranceAmountDollars = formatCurrency(INSURANCE_FEE);
  const totalAmountDollars = formatCurrency(totalAmount);

  const createOrder = async () => {
    setPaymentError(null);
    setIsProcessing(true);

    try {
      console.log("[PayPal] Initiating payment for auction:", {
        auctionId,
        includeInsurance,
        totalAmount
      });

      const response = await fetch(`/api/auctions/${auctionId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          includeInsurance
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create payment");
      }

      const data = await response.json();
      console.log("[PayPal] Order created:", data.orderId);
      return data.orderId;
    } catch (error) {
      console.error("[PayPal] Order creation error:", error);
      setPaymentError(error instanceof Error ? error.message : "Payment initialization failed");
      setIsProcessing(false);
      throw error;
    }
  };

  const onApprove = async (data: { orderID: string }) => {
    try {
      console.log("[PayPal] Payment approved, capturing payment:", data.orderID);

      const response = await fetch(`/api/payments/${data.orderID}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error("Failed to capture payment");
      }

      // Redirect to success page
      window.location.href = `/payment-success?order=${data.orderID}`;
    } catch (error) {
      console.error("[PayPal] Payment capture error:", error);
      setPaymentError(error instanceof Error ? error.message : "Payment capture failed");
      setIsProcessing(false);
    }
  };

  if (isAuctionLoading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner /></div>;
  }

  if (!auction) {
    return <div className="p-4">Auction not found</div>;
  }

  // Check PayPal configuration
  if (!import.meta.env.VITE_PAYPAL_CLIENT_ID) {
    return (
      <div className="container max-w-3xl mx-auto p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>PayPal configuration is missing</AlertTitle>
          <AlertDescription>Please contact support.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Complete Your Purchase</h1>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
            <CardDescription>
              Auction: {auction.title}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
              <span>Winning bid amount</span>
              <span className="font-medium">{baseAmountDollars}</span>
            </div>

            <div className="flex justify-between items-center p-4 border-b">
              <span>Platform fee (5%)</span>
              <span>{platformFeeDollars}</span>
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

            {paymentError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Payment Error</AlertTitle>
                <AlertDescription>{paymentError}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter>
            <PayPalScriptProvider options={{
              clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
              currency: "USD",
              intent: "capture"
            }}>
              <PayPalButtons
                style={{
                  layout: "vertical",
                  shape: "rect",
                }}
                disabled={isProcessing}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={(err) => {
                  console.error("[PayPal] Button error:", err);
                  setPaymentError("Payment failed. Please try again.");
                  setIsProcessing(false);
                }}
              />
            </PayPalScriptProvider>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}