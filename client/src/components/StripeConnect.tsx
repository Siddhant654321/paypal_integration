import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface StripeConnectProps {
  url: string; // The URL for the Stripe Connect account onboarding
  onComplete?: () => void;
}

export function StripeConnect({ url, onComplete }: StripeConnectProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we have a URL, redirect to it immediately
    if (url) {
      console.log('Redirecting to Stripe Connect onboarding URL:', url);
      window.location.href = url;
    } else {
      setLoading(false);
      setError('No Stripe Connect URL provided');
    }
  }, [url]);

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <span>Redirecting to Stripe...</span>
      </div>
    );
  }

  return null;
}