import { useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";

interface StripeConnectProps {
  clientSecret: string;
  onComplete?: () => void;
}

declare global {
  interface Window {
    StripeConnect?: {
      EmbeddedComponents: {
        mount: (options: any) => void;
      };
    };
  }
}

export function StripeConnect({ clientSecret, onComplete }: StripeConnectProps) {
  const { toast } = useToast();

  useEffect(() => {
    // Load the Stripe Connect script
    const script = document.createElement('script');
    script.src = 'https://connect.stripe.com/connect-js/v1';
    script.async = true;

    const mountStripeConnect = () => {
      if (!window.StripeConnect?.EmbeddedComponents) {
        console.error('Stripe Connect not loaded');
        return;
      }

      const container = document.getElementById('stripe-connect-mount');
      if (!container) {
        console.error('Mount point not found');
        return;
      }

      try {
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
            toast({
              title: "Account setup completed",
              description: "Your account has been successfully set up.",
            });
            onComplete?.();
          },
          onError: (error: Error) => {
            console.error('Stripe Connect error:', error);
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
          },
        });
      } catch (error) {
        console.error('Error mounting Stripe Connect:', error);
        toast({
          title: "Error",
          description: "Failed to load the account setup form. Please try again.",
          variant: "destructive",
        });
      }
    };

    script.onload = mountStripeConnect;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [clientSecret, onComplete, toast]);

  return (
    <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background" />
  );
}