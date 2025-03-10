import React, { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
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
  const location = useLocation(); // Added useLocation from wouter
  const auctionId = parseInt(id || "0");
  const { data: auction, isLoading: isAuctionLoading } = useAuction(auctionId);
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

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

  const initiatePaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/auctions/${auctionId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          includeInsurance
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to initiate payment");
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        // PayPal checkout - redirect to PayPal
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      setPaymentError(error.message);
    }
  });

  // PayPal configuration
  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "ASZElLfpU3DpC6dyDJDstkUZ_aQ_YXxvMfVHWO3z9QnIOUQkKiLLLmB77lRXF30LLTz4_LG9PW8v05MI";

  useEffect(() => {
    console.log("[PayPal] Initializing SDK:", {
      clientIdPresent: !!paypalClientId,
      clientIdPrefix: paypalClientId ? paypalClientId.substring(0, 8) + "..." : "missing"
    });
  }, [paypalClientId]);

  if (isAuctionLoading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner /></div>;
  }

  if (!auction) {
    return <div className="p-4">Auction not found</div>;
  }

  // Check PayPal configuration
  if (!paypalClientId) {
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

  const error = paymentError;
  const isLoading = initiatePaymentMutation.isPending;

  const handlePayNowClick = () => {
    initiatePaymentMutation.mutate();
  };

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

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter>
            <Button 
              className="w-full" 
              onClick={handlePayNowClick}
              disabled={isLoading}
            >
              {isLoading ? <LoadingSpinner className="mr-2" /> : null}
              Pay Now with PayPal
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}