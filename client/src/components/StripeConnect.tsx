import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface StripeConnectProps {
  url: string;
  onComplete?: () => void;
}

export function StripeConnect({ url, onComplete }: StripeConnectProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    const validateAndSetUrl = async () => {
      try {
        if (!url) {
          throw new Error('No Stripe Connect URL provided');
        }

        // Basic URL validation
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes('stripe.com')) {
          throw new Error('Invalid Stripe Connect URL');
        }

        console.log('Stripe Connect onboarding URL validated:', url);
        setRedirectUrl(url);
        setLoading(false);
      } catch (err) {
        console.error('Stripe Connect URL validation error:', err);
        setError(err instanceof Error ? err.message : 'Invalid Stripe Connect URL');
        setLoading(false);
      }
    };

    validateAndSetUrl();
  }, [url]);

  const handleRedirect = () => {
    if (redirectUrl) {
      // Open in a new tab
      const newWindow = window.open(redirectUrl, '_blank', 'noopener,noreferrer');

      // Check if window was successfully opened
      if (newWindow) {
        if (onComplete) {
          onComplete();
        }
      } else {
        setError('Pop-up blocked. Please allow pop-ups and try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 space-x-2">
        <LoadingSpinner className="h-6 w-6" />
        <span>Preparing Stripe Connect...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          You'll be redirected to Stripe to complete your account setup. Please have your business information and banking details ready.
        </AlertDescription>
      </Alert>

      <Button 
        onClick={handleRedirect}
        size="lg"
        className="w-full max-w-sm"
      >
        Set Up Stripe Account
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        This will open in a new tab. Return to this page once you've completed the setup.
      </p>
    </div>
  );
}