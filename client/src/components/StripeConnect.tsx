
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
    // Initialize the redirect to Stripe Connect onboarding
    const redirectToStripe = async () => {
      try {
        setLoading(true);

        console.log('Redirecting to Stripe Connect onboarding URL:', url);

        // Simply redirect to the provided URL
        window.location.href = url;

        // Note: The rest of this code won't execute due to the redirect
        // The onComplete callback will be handled when the user returns from Stripe
        // via the return_url parameter

      } catch (error) {
        console.error('Stripe Connect redirect error:', error);
        setLoading(false);
        setError(error instanceof Error ? error.message : 'Failed to redirect to Stripe Connect');
      }
    };

    // Only redirect if we have a URL
    if (url) {
      redirectToStripe();
    } else {
      setLoading(false);
      setError('No Stripe Connect URL provided');
    }

    return () => {
      // Cleanup if needed
    };
  }, [url, onComplete]);

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 text-red-700 rounded-md">
        <p className="font-medium">Error</p>
        <p>{error}</p>
        <div className="mt-4">
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md"
          >
            Try Again
          </button>
        </div>
        <p className="mt-2 text-sm">
          If this issue persists, please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {loading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Redirecting to Stripe Connect...</span>
        </div>
      )}
    </div>
  );
}
