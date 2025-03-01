
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface StripeConnectProps {
  clientSecret: string;
  onComplete?: () => void;
}

export function StripeConnect({ clientSecret, onComplete }: StripeConnectProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Stripe and handle the Connect account onboarding
    const initStripeConnect = async () => {
      try {
        setLoading(true);
        
        // Log the client secret (first 10 chars only for security)
        const secretPreview = clientSecret.substring(0, 10) + '...';
        console.log('Initializing Stripe Connect with client secret starting with:', secretPreview);
        
        // Load the Stripe Connect script
        const script = document.createElement('script');
        script.src = 'https://connect.stripe.com/connect-js';
        script.async = true;

        // Create a promise to handle script loading
        const scriptLoaded = new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Stripe Connect script'));
        });

        document.body.appendChild(script);
        await scriptLoaded;
        
        console.log('Stripe Connect script loaded successfully');

        // Ensure we have StripeConnect in window
        if (typeof window.StripeConnect === 'undefined') {
          console.error('StripeConnect not found in window object');
          throw new Error('Stripe Connect failed to initialize');
        }

        console.log('Mounting Stripe Connect with client secret');
        
        // Mount the Connect account onboarding form
        window.StripeConnect.accountLinking({
          clientSecret: clientSecret,
          onComplete: () => {
            console.log('Stripe Connect onboarding completed successfully');
            setLoading(false);
            if (onComplete) {
              onComplete();
            }
          },
          onError: (error: any) => {
            console.error('Stripe Connect error:', error);
            setLoading(false);
            setError(error?.message || 'An error occurred during the onboarding process');
          }
        }).mount('#stripe-connect-mount');
        
      } catch (error) {
        console.error('Stripe Connect initialization error:', error);
        setLoading(false);
        setError(error instanceof Error ? error.message : 'Failed to initialize Stripe Connect');
      }
    };

    initStripeConnect();

    return () => {
      // Cleanup
      const script = document.querySelector('script[src*="connect-js"]');
      if (script) {
        document.body.removeChild(script);
      }
    };
  }, [clientSecret, onComplete]);

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 text-red-700 rounded-md">
        <p className="font-medium">Error</p>
        <p>{error}</p>
        <p className="mt-2 text-sm">
          Please try again or contact support if this issue persists.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading Stripe Connect...</span>
        </div>
      )}
      <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background"></div>
    </div>
  );
}

// Add TypeScript declarations for Stripe Connect
declare global {
  interface Window {
    StripeConnect?: {
      accountLinking: (options: {
        clientSecret: string;
        onComplete?: () => void;
        onError?: (error: any) => void;
      }) => {
        mount: (elementId: string) => void;
      };
    };
  }
}
