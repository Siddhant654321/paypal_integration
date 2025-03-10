
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";

export default function PaymentSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get query parameters
  const queryParams = new URLSearchParams(location.search);
  const orderId = queryParams.get('token');
  const auctionId = queryParams.get('auction');
  
  // If we have an orderId from PayPal, verify payment status
  const { data: orderData, isLoading, isError } = useQuery({
    queryKey: ['paypal-order', orderId],
    queryFn: () => api.get(`/payment/${orderId}`).then(res => res.data),
    enabled: !!orderId,
    retry: false
  });

  // Get auction details if we have an auction ID
  const { data: auction } = useQuery({
    queryKey: ['auction', auctionId],
    queryFn: () => api.get(`/auctions/${auctionId}`).then(res => res.data),
    enabled: !!auctionId
  });

  // Process payment completion
  useEffect(() => {
    if (orderId && orderData && !paymentProcessed) {
      if (orderData.status === 'APPROVED' || orderData.status === 'COMPLETED') {
        // Capture the payment on the backend
        api.post(`/payments/${orderId}/capture`)
          .then(() => {
            setPaymentProcessed(true);
          })
          .catch(err => {
            console.error("Error capturing payment:", err);
            setError(err.response?.data?.message || "Failed to complete payment");
          });
      } else if (orderData.status === 'VOIDED' || orderData.status === 'FAILED') {
        setError("Payment was not completed. Please try again.");
      }
    }
  }, [orderId, orderData, paymentProcessed]);

  if (isLoading) {
    return (
      <div className="container max-w-lg mx-auto py-16 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="mt-4 text-lg font-medium">Verifying your payment...</h2>
        <p className="text-muted-foreground mt-2">Please wait while we confirm your transaction.</p>
      </div>
    );
  }

  if (isError || error) {
    return (
      <div className="container max-w-lg mx-auto py-8">
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Payment Error</AlertTitle>
          <AlertDescription>
            {error || "We couldn't verify your payment. Please contact support if you believe this is an error."}
          </AlertDescription>
        </Alert>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button asChild>
            <Link to="/profile">View My Purchases</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-lg mx-auto py-8 px-4">
      <Card className="border-green-200">
        <CardHeader className="pb-4">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl">Payment Successful!</CardTitle>
          <CardDescription className="text-center">
            Thank you for your purchase. Your payment has been processed successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {auction && (
            <div className="rounded-lg border p-4">
              <div className="flex gap-4 items-start">
                <div className="h-20 w-20 rounded-md overflow-hidden flex-shrink-0">
                  <img 
                    src={auction.imageUrl} 
                    alt={auction.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-medium">{auction.title}</h3>
                  <p className="text-muted-foreground text-sm">Auction #{auction.id}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p><strong>Order Reference:</strong> {orderId || 'N/A'}</p>
            <p><strong>Status:</strong> Payment Complete</p>
            <p className="text-sm text-muted-foreground mt-4">
              A confirmation email has been sent to your registered email address.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link to="/profile">View My Purchases</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">Return to Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
