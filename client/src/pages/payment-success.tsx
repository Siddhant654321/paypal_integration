import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [auctionId, setAuctionId] = useState<number | null>(null);

  // Get the payment_intent from URL query params
  const searchParams = new URLSearchParams(window.location.search);
  const paymentIntentId = searchParams.get('payment_intent');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!paymentIntentId) {
        console.error('[PAYMENT SUCCESS] No payment intent ID found in URL');
        setError('Payment verification failed. Please contact support if you believe this is an error.');
        setLoading(false);
        return;
      }

      try {
        console.log('[PAYMENT SUCCESS] Verifying payment:', paymentIntentId);

        // Check payment status using our verification endpoint
        const response = await fetch(`/api/payments/${paymentIntentId}/verify`, {
          credentials: 'include' // Include session cookie
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Payment verification failed');
        }

        const data = await response.json();
        console.log('[PAYMENT SUCCESS] Payment verification response:', data);

        if (data.auctionId) {
          setAuctionId(data.auctionId);
        }

        setSuccess(true);
        setLoading(false);
      } catch (err) {
        console.error('[PAYMENT SUCCESS] Error:', err);
        setError(err instanceof Error ? err.message : 'Payment verification failed');
        setLoading(false);
      }
    };

    verifyPayment();
  }, [paymentIntentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verifying Payment</CardTitle>
            <CardDescription>
              Please wait while we verify your payment...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-6">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Payment Verification Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-green-600 flex items-center">
            <Check className="mr-2 h-6 w-6" />
            Payment Successful
          </CardTitle>
          <CardDescription>
            Thank you for your payment. Your transaction has been completed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground mb-4">
            A confirmation has been sent to the seller, and they will prepare your items for shipping.
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" asChild>
            <Link href="/">Return Home</Link>
          </Button>
          {auctionId && (
            <Button asChild>
              <Link href={`/auctions/${auctionId}`}>View Auction</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}