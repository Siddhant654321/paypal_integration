import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AuctionDetails } from "@/components/auction-details";
import { AlertCircle, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Checkbox } from "../components/ui/checkbox";
import { LoadingSpinner } from "../components/loading-spinner";


export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Fetch auction details
  const { data: auction, isLoading: auctionLoading, error: auctionError } = useQuery({
    queryKey: ["auction", id],
    queryFn: () => api.get(`/auctions/${id}`).then(res => res.data),
    enabled: !!id
  });

  // Check if PayPal client ID is available
  useEffect(() => {
    const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!paypalClientId || paypalClientId === '${process.env.PAYPAL_CLIENT_ID}') {
      console.error("[PayPal] Client ID is missing or not properly resolved");
      setError("PayPal configuration is missing. Please contact support.");
      return;
    }
    console.log("[PayPal] SDK configuration ready with Client ID:", paypalClientId.substring(0, 5) + '...');
    setSdkReady(true);
  }, []);

  // Create order function
  const createOrder = async () => {
    setProcessing(true);
    try {
      const { data } = await api.post(`/api/payment/create/${id}`, {includeInsurance});
      setOrderId(data.id);
      return data.id;
    } catch (err: any) {
      console.error("[PayPal] Error creating order:", err);
      setError(err.response?.data?.message || "Failed to create payment");
      setProcessing(false);
      throw err;
    }
  };

  // Handle approve function
  const onApprove = async (data: any) => {
    try {
      setProcessing(true);
      const response = await api.post(`/api/payment/capture/${data.orderID}`);
      console.log("[PayPal] Payment captured:", response.data);
      setSuccess(true);
      setTimeout(() => {
        navigate(`/payment/success?order_id=${data.orderID}`);
      }, 1500);
    } catch (err: any) {
      console.error("[PayPal] Error capturing payment:", err);
      setError(err.response?.data?.message || "Failed to process payment");
      setProcessing(false);
    }
  };

  // Handle error function
  const onError = (err: any) => {
    console.error("[PayPal] Payment error:", err);
    setError("An error occurred during payment processing. Please try again.");
    setProcessing(false);
  };

  // Handle cancel function
  const onCancel = () => {
    console.log("[PayPal] Payment cancelled by user");
    setProcessing(false);
  };

  // If loading auction data
  if (auctionLoading) {
    return (
      <Container className="py-8">
        <Skeleton className="h-64 w-full mb-4" />
        <Skeleton className="h-8 w-2/3 mb-2" />
        <Skeleton className="h-6 w-1/2 mb-4" />
        <Skeleton className="h-10 w-full" />
      </Container>
    );
  }

  // If auction fetch error
  if (auctionError || !auction) {
    return (
      <Container className="py-8">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load auction details. Please try again.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </Container>
    );
  }

  // If auction is not valid for payment
  if (auction.status !== "ended" || auction.paymentStatus !== "pending" || auction.winningBidderId !== auction.currentUser?.id) {
    return (
      <Container className="py-8">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not Available</AlertTitle>
          <AlertDescription>
            This auction is not available for payment or you are not the winning bidder.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <Button variant="outline" className="mb-6" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Auction
      </Button>

      <div className="grid md:grid-cols-5 gap-8">
        <div className="md:col-span-3">
          <AuctionDetails auction={auction} />
        </div>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Complete Your Purchase</CardTitle>
            <CardDescription>
              You won this auction with a bid of {formatCurrency(auction.currentPrice)}.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Payment Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-4 bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-600">Payment Successful!</AlertTitle>
                <AlertDescription className="text-green-600">
                  Your payment has been processed successfully. Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item Price:</span>
                <span>{formatCurrency(auction.currentPrice)}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total:</span>
                <span>{formatCurrency(auction.currentPrice)}</span>
              </div>
            </div>
             <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                    <Label htmlFor="insurance" className="font-medium">Add Shipping Insurance</Label>
                  </div>
                  <Switch
                    id="insurance"
                    checked={includeInsurance}
                    onCheckedChange={setIncludeInsurance}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  For just $8.00, protect your purchase against damage, loss, or theft during shipping.
                </p>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="terms" 
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Accept Terms and Conditions
                  </label>
                  <p className="text-sm text-muted-foreground">
                    I agree to the <a href="/terms" className="text-primary underline">terms of service</a> and payment conditions.
                  </p>
                </div>
              </div>
          </CardContent>

          <CardFooter className="flex flex-col">
            {sdkReady ? (
              <PayPalScriptProvider 
                options={{ 
                  "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
                  currency: "USD",
                  intent: "capture"
                }}
              >
                <div className="w-full">
                  <PayPalButtons
                    style={{ layout: "vertical", label: "pay" }}
                    disabled={processing || !acceptedTerms}
                    forceReRender={[auction.id, auction.currentPrice]}
                    createOrder={createOrder}
                    onApprove={onApprove}
                    onError={onError}
                    onCancel={onCancel}
                  />
                </div>
              </PayPalScriptProvider>
            ) : processing ? (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </Button>
            ) : (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Payment Options...
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </Container>
  );
}