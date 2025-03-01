
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StripeConnectProps {
  url: string; // The URL for the Stripe Connect account onboarding
  onComplete?: () => void;
}

export function StripeConnect({ url, onComplete }: StripeConnectProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    // If we have a URL, store it but don't redirect automatically
    if (url) {
      console.log('Stripe Connect onboarding URL:', url);
      setRedirectUrl(url);
      setLoading(false);
    } else {
      setLoading(false);
      setError('No Stripe Connect URL provided');
    }
  }, [url]);

  const handleRedirect = () => {
    if (redirectUrl) {
      // Open in a new tab instead of redirecting the current page
      window.open(redirectUrl, '_blank', 'noopener,noreferrer');
      if (onComplete) {
        onComplete();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <span>Preparing Stripe Connect...</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <p className="mb-4 text-center">
        Click the button below to set up your Stripe account in a new tab.
      </p>
      <Button onClick={handleRedirect}>
        Open Stripe Connect
      </Button>
    </div>
  );
}
