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
    // Check if the script is already loaded
    if (document.getElementById('stripe-js')) {
      if (window.StripeConnect) {
        mountStripeConnect();
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'stripe-js';
    script.src = 'https://js.stripe.com/v3/connect-js/';
    script.async = true;

    script.onload = () => {
      console.log('Stripe Connect script loaded');
      if (window.StripeConnect) {
        mountStripeConnect();
      } else {
        setIsLoading(false);
        toast({
          title: "Error",
          description: "Failed to load Stripe Connect",
          variant: "destructive",
        });
      }
    };

    script.onerror = () => {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to load Stripe Connect script",
        variant: "destructive",
      });
    };

    document.body.appendChild(script);

    return () => {
      if (document.getElementById('stripe-js')) {
        document.getElementById('stripe-js')?.remove();
      }
    };
  }, [clientSecret, toast]);

  const mountStripeConnect = () => {
    try {
      const targetElement = document.getElementById('stripe-connect-mount');
      if (!targetElement) {
        throw new Error('Mount point not found');
      }

      window.StripeConnect?.EmbeddedComponents.mount({
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
          toast({
            title: "Success",
            description: "Account setup completed successfully",
          });
          setIsLoading(false);
          if (onComplete) {
            onComplete();
          }
        },
        onError: (error: Error) => {
          toast({
            title: "Error",
            description: error.message || "Failed to complete account setup",
            variant: "destructive",
          });
          setIsLoading(false);
        },
      });
    } catch (error) {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to initialize Stripe Connect",
        variant: "destructive",
      });
    }
  };

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