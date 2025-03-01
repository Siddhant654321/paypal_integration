import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedAccountOnboarding } from '@stripe/react-stripe-js';

// Interface for component props
interface StripeConnectProps {
  clientSecret: string;
  onComplete?: () => void;
}

export function StripeConnect({ clientSecret, onComplete }: StripeConnectProps) {
  const [stripePromise, setStripePromise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Stripe
    const initializeStripe = async () => {
      try {
        setLoading(true);
        // Get publishable key from environment variable
        const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

        if (!publishableKey) {
          throw new Error('Stripe publishable key not found');
        }

        const stripeInstance = await loadStripe(publishableKey);
        setStripePromise(stripeInstance as any);
        setLoading(false);
      } catch (err) {
        console.error('Error initializing Stripe:', err);
        setError('Failed to initialize payment system. Please try again later.');
        setLoading(false);
      }
    };

    initializeStripe();
  }, []);

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    console.log('Stripe onboarding completed');
    if (onComplete) {
      onComplete();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading payment system...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 text-red-700 rounded-md">
        <p>{error}</p>
        <p className="mt-2 text-sm">
          If this issue persists, please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {stripePromise && clientSecret ? (
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
          <EmbeddedAccountOnboarding 
            onComplete={handleOnboardingComplete}
            style={{ height: '600px' }}
          />
        </EmbeddedCheckoutProvider>
      ) : (
        <p>Unable to load Stripe. Missing configuration.</p>
      )}
    </div>
  );
}