
import { useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";

interface StripeConnectProps {
  clientSecret: string;
  onComplete?: () => void;
}

export function StripeConnect({ clientSecret, onComplete }: StripeConnectProps) {
  const { toast } = useToast();

  useEffect(() => {
    // Check if the script is already loaded to avoid duplicates
    if (document.getElementById('stripe-connect-script')) {
      document.getElementById('stripe-connect-script')?.remove();
    }

    const targetElement = document.getElementById('stripe-connect-mount');
    if (!targetElement) {
      console.error('Target element #stripe-connect-mount not found');
      return;
    }

    // Load Stripe Connect script
    const script = document.createElement('script');
    script.id = 'stripe-connect-script';
    script.src = 'https://js.stripe.com/v3/connect-embeddable/v1/';
    script.async = true;
    
    script.onload = () => {
      console.log('Stripe Connect script loaded successfully');
      
      // Wait for Stripe to initialize
      setTimeout(() => {
        if (!window.StripeConnect) {
          console.error('StripeConnect not found on window object');
          toast({
            title: "Error",
            description: "Failed to load Stripe Connect. Please refresh and try again.",
            variant: "destructive",
          });
          return;
        }
        
        try {
          console.log('Mounting Stripe Connect with client secret:', clientSecret.substring(0, 5) + '...');
          
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
              console.log('Stripe Connect onComplete callback fired');
              toast({
                title: "Account setup completed",
                description: "Your account has been successfully set up.",
              });
              if (onComplete) {
                onComplete();
              }
            },
            onError: (error: Error) => {
              console.error('Stripe Connect error:', error);
              toast({
                title: "Error",
                description: error.message || "An error occurred during setup",
                variant: "destructive",
              });
            },
          });
          console.log('Stripe Connect mounted successfully');
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
    <div id="stripe-connect-mount" className="w-full min-h-[600px] border rounded-lg bg-background"></div>
  );
}

// TypeScript declaration
declare global {
  interface Window {
    StripeConnect?: {
      EmbeddedComponents: {
        mount: (options: any) => void;
      };
    };
  }
}
