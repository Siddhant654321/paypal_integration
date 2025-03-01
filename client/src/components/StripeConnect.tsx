
import React, { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface StripeConnectProps {
  clientSecret: string;
  onComplete?: () => void;
}

export function StripeConnect({ clientSecret, onComplete }: StripeConnectProps) {
  const { toast } = useToast();

  useEffect(() => {
    // Make sure we don't load the script multiple times
    if (document.getElementById('stripe-connect-script')) {
      document.getElementById('stripe-connect-script')?.remove();
    }

    // Create and append script
    const script = document.createElement('script');
    script.id = 'stripe-connect-script';
    script.src = 'https://js.stripe.com/v3/connect-embeddable/v1/';
    script.async = true;
    
    // Define the onload handler
    script.onload = () => {
      console.log('Stripe Connect script loaded');
      
      // Small delay to ensure script is fully initialized
      setTimeout(() => {
        try {
          if (typeof window.StripeConnect === 'undefined') {
            console.error('StripeConnect is not defined on window');
            toast({
              title: "Error",
              description: "Failed to load Stripe Connect. Please refresh and try again.",
              variant: "destructive",
            });
            return;
          }
          
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
      }, 1000);
    };

    script.onerror = () => {
      console.error('Failed to load Stripe Connect script');
      toast({
        title: "Error",
        description: "Failed to load Stripe Connect. Please check your internet connection.",
        variant: "destructive",
      });
    };

    document.body.appendChild(script);

    return () => {
      if (document.getElementById('stripe-connect-script')) {
        document.getElementById('stripe-connect-script')?.remove();
      }
    };
  }, [clientSecret, onComplete, toast]);

  return (
    <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background" />
  );
}

// Add TypeScript declaration
declare global {
  interface Window {
    StripeConnect: {
      EmbeddedComponents: {
        mount: (options: any) => void;
      };
    };
  }
}
