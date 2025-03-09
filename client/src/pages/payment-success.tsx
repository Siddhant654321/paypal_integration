
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function PaymentSuccessPage() {
  const [location] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get the session ID from URL query params
  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setError('No payment session ID found');
        setLoading(false);
        return;
      }

      try {
        // Check payment status
        const response = await fetch(`/api/checkout-sessions/${sessionId}/verify`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Payment verification failed');
        }
        
        const data = await response.json();
        console.log('[PAYMENT SUCCESS] Payment verification:', data);
        
        setSuccess(true);
        setLoading(false);
      } catch (err) {
        console.error('[PAYMENT SUCCESS] Error:', err);
        setError(err instanceof Error ? err.message : 'Payment verification failed');
        setLoading(false);
      }
    };

    verifyPayment();
  }, [sessionId]);

  return (
    <div className="container max-w-md mx-auto py-10">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Payment Confirmation</CardTitle>
          <CardDescription>
            {loading ? 'Verifying your payment...' : 
             success ? 'Your payment has been processed' : 
             'Payment status'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center space-y-4">
          {loading ? (
            <div className="flex flex-col items-center py-4">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="mt-4 text-center text-muted-foreground">
                Please wait while we verify your payment...
              </p>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center py-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-10 w-10 text-green-500" />
              </div>
              <p className="mt-4 text-center">
                Thank you for your payment! Your transaction has been completed successfully.
              </p>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-center">
          <Link href="/my-auctions">
            <Button>
              Back to My Auctions
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
