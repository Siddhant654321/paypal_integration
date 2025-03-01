
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';

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
        
        // Load the Stripe Connect script
        const script = document.createElement('script');
        script.src = 'https://connect.stripe.com/connect-js/v1';
        script.async = true;

        // Create a promise to handle script loading
        const scriptLoaded = new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Stripe Connect script'));
        });

        document.body.appendChild(script);
        await scriptLoaded;

        // Wait for Stripe Connect to initialize
        setTimeout(() => {
          if (!window.StripeConnect) {
            throw new Error('Stripe Connect failed to initialize');
          }

          // Mount the Connect onboarding form
          window.StripeConnect.EmbeddedComponents.mount({
            clientSecret,
            appearance: {
              theme: 'flat',
              variables: {
                colorPrimary: '#0F172A',
                colorBackground: '#ffffff',
                colorText: '#1e293b',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                borderRadius: '0.5rem',
                spacingUnit: '5px',
              },
            },
            onComplete: () => {
              setLoading(false);
              console.log('Stripe Connect onboarding completed successfully');
              if (onComplete) {
                onComplete();
              }
            },
            onError: (error: Error) => {
              setLoading(false);
              setError(error.message || 'An error occurred during the onboarding process');
              console.error('Stripe Connect error:', error);
            },
          }, '#stripe-connect-mount');
        }, 1000);
      } catch (error) {
        setLoading(false);
        console.error('Stripe Connect initialization error:', error);
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
      <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background" />
    </div>
  );
}

// Add TypeScript declarations for Stripe Connect
declare global {
  interface Window {
    StripeConnect?: {
      EmbeddedComponents: {
        mount: (options: {
          clientSecret: string;
          appearance?: {
            theme: 'flat' | 'stripe' | 'night';
            variables?: Record<string, string>;
          };
          onComplete?: () => void;
          onError?: (error: Error) => void;
        }, elementId: string) => void;
      };
    };
  }
}
