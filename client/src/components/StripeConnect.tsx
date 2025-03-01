
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
        
        // Log the client secret preview (first few chars only for security)
        const secretPreview = clientSecret.substring(0, 10) + '...';
        console.log('Initializing Stripe Connect with client secret starting with:', secretPreview);
        
        // Load the Stripe Connect script
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;

        // Create a promise to handle script loading
        const scriptLoaded = new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Stripe script'));
        });

        document.body.appendChild(script);
        await scriptLoaded;
        
        console.log('Stripe script loaded successfully');

        // Check if Stripe is defined in the global scope
        if (typeof window.Stripe === 'undefined') {
          console.error('Stripe not found in window object');
          throw new Error('Stripe failed to initialize');
        }

        // Initialize Stripe
        const stripe = window.Stripe(process.env.STRIPE_PUBLISHABLE_KEY || '');
        
        // Redirect to the account setup page
        const { error } = await stripe.accountLinks.redirect({
          accountLinkSecret: clientSecret,
        });

        if (error) {
          console.error('Stripe redirect error:', error);
          throw new Error(error.message);
        }

        // If we get here, the redirect was successful
        console.log('Stripe Connect redirect successful');
        
        // Note: onComplete won't actually be called here since the page will redirect
        // It will be handled when the user returns from Stripe
        setLoading(false);
        
      } catch (error) {
        console.error('Stripe Connect initialization error:', error);
        setLoading(false);
        setError(error instanceof Error ? error.message : 'Failed to initialize Stripe Connect');
      }
    };

    initStripeConnect();

    return () => {
      // Cleanup
      const script = document.querySelector('script[src*="stripe.com"]');
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
          <span className="ml-2">Initializing Stripe Connect...</span>
        </div>
      )}
      <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background"></div>
    </div>
  );
}

// Add TypeScript declarations for Stripe
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => {
      accountLinks: {
        redirect: (options: {
          accountLinkSecret: string;
        }) => Promise<{
          error?: {
            message: string;
          };
        }>;
      };
    };
  }
}
