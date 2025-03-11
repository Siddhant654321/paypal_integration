import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const orderId = searchParams.get("orderId") || "";

  useEffect(() => {
    if (!orderId) {
      setStatus("error");
      setError("No order ID found in URL parameters");
      return;
    }

    // Verify payment success with backend
    fetch(`/api/payments/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    })
    .then(response => {
      if (response.ok) {
        setStatus("success");
        // Refresh user bids data to update UI
        queryClient.invalidateQueries({ queryKey: ['userBids'] });
      } else {
        return response.json().then(data => {
          throw new Error(data.message || "Failed to process payment");
        });
      }
    })
    .catch((error) => {
      console.error("[PayPal] Payment capture error:", error);
      setStatus("error");
      setError(error.message || "An error occurred processing your payment. Please contact support.");
    });
  }, [orderId, queryClient]);

  // Redirect to dashboard after 5 seconds on success
  useEffect(() => {
    let timer: number;
    if (status === "success") {
      timer = window.setTimeout(() => {
        navigate("/buyer-dashboard");
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [status, navigate]);

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            {status === "loading" && <LoadingSpinner className="mr-2" />}
            {status === "success" && <CheckCircle2 className="mr-2 text-green-600" />}
            {status === "error" && <XCircle className="mr-2 text-red-600" />}

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
                We encountered an issue processing your payment. If funds were deducted from your
                account, they will be refunded automatically.
              </p>
              <p className="text-sm">
                Please contact our support team for assistance.
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center gap-4">
          {status === "success" && (
            <Button onClick={() => navigate("/buyer-dashboard")}>
              Go to Dashboard
            </Button>
          )}

          {status === "error" && (
            <>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Go Back
              </Button>
              <Button onClick={() => navigate("/contact")}>
                Contact Support
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}