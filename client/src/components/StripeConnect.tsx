import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface StripeConnectProps {
  clientSecret: string;
  onComplete?: () => void;
}

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
        }) => void;
      };
    };
  }
}

export function StripeConnect({ clientSecret, onComplete }: StripeConnectProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAndMount = async () => {
      try {
        // Load the Stripe Connect script
        const script = document.createElement('script');
        script.src = 'https://b.stripecdn.com/connect-js/v1/connect-js-v1.min.js';
        script.async = true;

        // Create a promise to handle script loading
        const scriptLoaded = new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Stripe Connect script'));
        });

        document.body.appendChild(script);
        await scriptLoaded;

        // Wait a moment for Stripe to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!window.StripeConnect) {
          throw new Error('Stripe Connect failed to initialize');
        }

        // Mount the Connect components
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
            setIsLoading(false);
            toast({
              title: "Success",
              description: "Account setup completed successfully",
            });
            if (onComplete) {
              onComplete();
            }
          },
          onError: (error: Error) => {
            setIsLoading(false);
            toast({
              title: "Error",
              description: error.message || "Failed to complete account setup",
              variant: "destructive",
            });
          },
        });
      } catch (error) {
        setIsLoading(false);
        console.error('Stripe Connect error:', error);
        toast({
          title: "Error",
          description: "Failed to initialize Stripe Connect. Please try again.",
          variant: "destructive",
        });
      }
    };

    loadAndMount();

    return () => {
      // Cleanup script on unmount
      const script = document.querySelector('script[src*="connect-js"]');
      if (script) {
        document.body.removeChild(script);
      }
    };
  }, [clientSecret, toast, onComplete]);

  return (
    <div className="relative min-h-[600px]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background" />
    </div>
  );
}