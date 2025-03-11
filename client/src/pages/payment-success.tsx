import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Get orderId from URL search params
  const orderId = new URLSearchParams(window.location.search).get("orderId");

  useEffect(() => {
    if (!orderId) {
      setStatus("error");
      setError("No order ID found in URL parameters");
      return;
    }

    console.log("[Payment Success] Processing payment for order:", orderId);

    // Verify payment success with backend
    fetch(`/api/payments/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include' // Important for auth
    })
    .then(async response => {
      if (!response.ok) {
        // Try to get detailed error message
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to process payment", {
          cause: { code: data.error, status: response.status }
        });
      }
      return response.json();
    })
    .then(async data => {
      console.log("[Payment Success] Payment captured successfully");
      setStatus("success");

      // Refresh relevant data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/profile'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/auctions'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/user/bids'] })
      ]);

      toast({
        title: "Payment Successful",
        description: "Your payment has been processed successfully. The seller will be notified to proceed with shipping.",
      });
    })
    .catch((error: Error) => {
      console.error("[Payment Success] Error processing payment:", error);
      setStatus("error");

      // Handle specific error cases
      const cause = (error as any).cause;
      if (cause?.code === 'INSTRUMENT_DECLINED') {
        setError("Your payment method was declined. Please try a different payment method.");
        setErrorCode(cause.code);
      } else if (cause?.code === 'ORDER_NOT_APPROVED') {
        setError("Payment not yet approved. Please complete the PayPal checkout process first.");
        setErrorCode(cause.code);
      } else if (cause?.status === 404) {
        setError("Payment record not found. Please contact support if funds were deducted.");
        setErrorCode('PAYMENT_NOT_FOUND');
      } else {
        setError(error.message || "An error occurred processing your payment. Please contact support.");
      }

      toast({
        title: "Payment Error",
        description: error.message || "Failed to process payment",
        variant: "destructive",
      });
    });
  }, [orderId, queryClient, toast]);

  // Redirect to dashboard after 5 seconds on success
  useEffect(() => {
    let timer: number;
    if (status === "success") {
      timer = window.setTimeout(() => {
        setLocation("/dashboard");
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [status, setLocation]);

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status === "loading" && <LoadingSpinner />}
            {status === "success" && <CheckCircle2 className="text-green-600" />}
            {status === "error" && <XCircle className="text-red-600" />}

            {status === "loading" && "Processing Payment"}
            {status === "success" && "Payment Successful"}
            {status === "error" && "Payment Error"}
          </CardTitle>

          {status === "success" && (
            <CardDescription>
              Your payment has been successfully processed.
            </CardDescription>
          )}

          {status === "error" && (
            <CardDescription className="text-red-600">
              {error || "An error occurred processing your payment."}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          {status === "loading" && (
            <p className="text-center">
              Please wait while we confirm your payment...
            </p>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <p>
                Thank you for your purchase! The seller has been notified and will be
                processing your order shortly.
              </p>
              <p className="text-sm text-muted-foreground">
                You will be redirected to your dashboard in a few seconds.
              </p>
              {orderId && (
                <p className="text-sm text-muted-foreground">
                  Order ID: {orderId}
                </p>
              )}
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <p>
                {errorCode === 'INSTRUMENT_DECLINED' ? (
                  "Please try again with a different payment method. No charges have been made to your account."
                ) : errorCode === 'ORDER_NOT_APPROVED' ? (
                  "Please return to the checkout page and complete the PayPal payment process."
                ) : (
                  "We encountered an issue processing your payment. If funds were deducted from your account, they will be refunded automatically."
                )}
              </p>
              <p className="text-sm">
                {errorCode ? (
                  "If you continue to experience issues, please contact our support team."
                ) : (
                  "Please contact our support team for assistance."
                )}
              </p>
              {errorCode && (
                <p className="text-xs text-muted-foreground">
                  Error Code: {errorCode}
                </p>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center gap-4">
          {status === "success" && (
            <Button onClick={() => setLocation("/dashboard")}>
              Go to Dashboard
            </Button>
          )}

          {status === "error" && (
            <>
              <Button variant="outline" onClick={() => window.history.back()}>
                Go Back
              </Button>
              <Button asChild>
                <a href="/support" target="_blank" rel="noopener noreferrer">
                  Contact Support
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}