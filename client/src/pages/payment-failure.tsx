import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PaymentFailurePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Get error details from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const orderId = searchParams.get("orderId");
  const errorMessage = searchParams.get("error") || "Payment was cancelled or failed to complete.";
  const errorCode = searchParams.get("errorCode"); //Added to get errorCode

  useEffect(() => {
    // Log the failure for debugging
    console.log("[Payment Failure] Payment failed:", {
      orderId,
      error: errorMessage
    });

    // Show error toast
    toast({
      title: "Payment Failed",
      description: errorMessage,
      variant: "destructive",
    });

    // If we have an orderId, notify the backend about the failure
    if (orderId) {
      fetch(`/api/payments/${orderId}/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: errorMessage })
      }).catch(error => {
        console.error("[Payment Failure] Error notifying backend:", error);
      });
    }
  }, [orderId, errorMessage, toast]);

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="text-red-600" />
            Payment Failed
          </CardTitle>
          <CardDescription className="text-red-600">
            {errorMessage}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <p className="text-lg font-semibold text-red-600">
              {errorMessage || "Payment Processing Failed"}
            </p>
            <p className="text-sm text-gray-600">
              {errorMessage ? 
                "Please review the error and try again." : 
                "There was an issue processing your payment. Please try again."}
            </p>
            {errorCode && (
              <p className="text-xs text-gray-500">Error Code: {errorCode}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => window.history.back()}>
            Try Again
          </Button>
          <Button asChild>
            <a href="/support" target="_blank" rel="noopener noreferrer">
              Contact Support
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}