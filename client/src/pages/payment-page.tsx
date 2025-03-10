import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Shield, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatPrice } from "../utils/formatters";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";

const INSURANCE_FEE = 800; // $8.00 in cents

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  useEffect(() => {
    const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    console.log("[PayPal] Initializing SDK:", {
      clientIdPresent: !!paypalClientId,
      clientIdPrefix: paypalClientId ? paypalClientId.substring(0, 8) + '...' : 'missing'
    });

    if (!paypalClientId) {
      console.error("[PayPal] Client ID is missing");
      setError("PayPal configuration is missing. Please contact support.");
      return;
    }

    setSdkReady(true);
  }, []);

  const createOrder = async () => {
    if (isProcessing || !auction?.id) return;

    setIsProcessing(true);
    setError(null);

    try {
      console.log("[PayPal] Creating order for auction:", {
        auctionId: auction.id,
        includeInsurance,
        amount: auction.currentPrice + (includeInsurance ? INSURANCE_FEE : 0)
      });

      const response = await fetch(`/api/auctions/${auction.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ includeInsurance })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create payment session');
      }

      const data = await response.json();
      console.log("[PayPal] Order created successfully:", {
        orderId: data.orderId
      });
      return data.orderId;
    } catch (err) {
      console.error('[PayPal] Order creation error:', err);
      const errorMessage = err instanceof Error ? err.message : "Could not process your payment. Please try again.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: errorMessage,
      });
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const onApprove = async (data: { orderID: string }) => {
    try {
      console.log("[PayPal] Payment approved, capturing payment:", data.orderID);

      const response = await fetch(`/api/payments/${data.orderID}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to capture payment');
      }

      toast({
        title: "Payment Successful",
        description: "Your payment has been processed successfully.",
      });

      // Redirect to success page
      window.location.href = `/payment-success?order=${data.orderID}`;
    } catch (err) {
      console.error('[PayPal] Payment capture error:', err);
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: "Failed to complete payment. Please contact support.",
      });
    }
  };

  if (isLoadingAuction || !auction) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const baseAmountDollars = formatPrice(auction.currentPrice);
  const insuranceAmountDollars = formatPrice(INSURANCE_FEE);
  const totalAmountDollars = formatPrice(auction.currentPrice + (includeInsurance ? INSURANCE_FEE : 0));

  return (
    <div className="container mx-auto py-8">
      <Link href={`/auction/${auction.id}`}>
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Auction
        </Button>
      </Link>

      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Complete Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-lg font-medium">
            {auction.title}
          </div>

          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <span>Winning bid amount</span>
            <span className="font-medium">{baseAmountDollars}</span>
          </div>

          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <Shield className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <Label htmlFor="insurance">Shipping Insurance</Label>
              <p className="text-sm text-muted-foreground">
                Add {insuranceAmountDollars} insurance to protect against shipping issues
              </p>
            </div>
            <Switch
              id="insurance"
              checked={includeInsurance}
              onCheckedChange={setIncludeInsurance}
            />
          </div>

          <div className="text-2xl font-bold flex justify-between items-center">
            <span>Total Amount:</span>
            <span>{totalAmountDollars}</span>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {sdkReady ? (
            <PayPalScriptProvider options={{ 
              clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
              currency: "USD",
              intent: "capture",
              components: "buttons",
              'enable-funding': "paypal",
              'disable-funding': "card,paylater"
            }}>
              <PayPalButtons
                disabled={isProcessing}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={(err) => {
                  console.error('[PayPal] Button error:', err);
                  setError("Payment failed. Please try again or contact support.");
                }}
                style={{ 
                  layout: "vertical",
                  color: "gold",
                  shape: "rect",
                  label: "pay"
                }}
              />
            </PayPalScriptProvider>
          ) : (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>Loading payment options...</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          Your payment will be processed securely through PayPal.
        </CardFooter>
      </Card>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuction, usePayment } from "../hooks/data-hooks";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { formatCurrency } from "../utils/formatters";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auctionId = parseInt(id || "0");
  const { data: auction, isLoading: isAuctionLoading } = useAuction(auctionId);
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Calculate payment amounts
  const baseAmount = auction?.currentPrice || 0;
  const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
  const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
  const totalAmount = baseAmount + platformFee + insuranceFee;

  const initiatePaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/auctions/${auctionId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          includeInsurance
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to initiate payment");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        // PayPal checkout - redirect to PayPal
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      setPaymentError(error.message);
    }
  });

  // PayPal configuration
  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "ASZElLfpU3DpC6dyDJDstkUZ_aQ_YXxvMfVHWO3z9QnIOUQkKiLLLmB77lRXF30LLTz4_LG9PW8v05MI";
  
  useEffect(() => {
    console.log("[PayPal] Initializing SDK:", {
      clientIdPresent: !!paypalClientId,
      clientIdPrefix: paypalClientId ? paypalClientId.substring(0, 8) + "..." : "missing"
    });
  }, [paypalClientId]);

  if (isAuctionLoading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner /></div>;
  }

  if (!auction) {
    return <div className="p-4">Auction not found</div>;
  }

  if (paymentSuccess) {
    return (
      <Card className="max-w-3xl mx-auto my-8">
        <CardHeader>
          <CardTitle className="text-green-600 flex items-center">
            <CheckCircle2 className="mr-2" /> Payment Successful
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">Your payment for "{auction.title}" has been processed successfully.</p>
          <p className="mb-4">The seller will be notified and will begin preparing your item for shipping.</p>
          <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Complete Your Purchase</h1>
      
      {paymentError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payment Error</AlertTitle>
          <AlertDescription>{paymentError}</AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>Auction #{auction.id}: {auction.title}</CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="mb-4">
                <img
                  src={auction.imageUrl}
                  alt={auction.title}
                  className="rounded-md max-h-48 object-cover"
                />
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex justify-between">
                  <span>Item Price</span>
                  <span>{formatCurrency(baseAmount)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Platform Fee (10%)</span>
                  <span>{formatCurrency(platformFee)}</span>
                </div>
                {includeInsurance && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping Insurance</span>
                    <span>{formatCurrency(insuranceFee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 mb-6">
                <Switch
                  id="insurance"
                  checked={includeInsurance}
                  onCheckedChange={setIncludeInsurance}
                />
                <Label htmlFor="insurance">
                  Add Shipping Insurance (+{formatCurrency(INSURANCE_FEE)})
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>Secure payment via PayPal</CardDescription>
            </CardHeader>
            
            <CardContent>
              <PayPalScriptProvider options={{
                "client-id": paypalClientId,
                currency: "USD",
                intent: "capture"
              }}>
                <PayPalButtons
                  style={{ layout: "vertical" }}
                  disabled={isAuctionLoading}
                  forceReRender={[totalAmount, includeInsurance]}
                  createOrder={(data, actions) => {
                    return actions.order.create({
                      purchase_units: [
                        {
                          description: `Payment for auction #${auction.id}`,
                          amount: {
                            value: (totalAmount / 100).toFixed(2)
                          }
                        }
                      ]
                    });
                  }}
                  onApprove={(data, actions) => {
                    if (actions.order) {
                      return actions.order.capture().then((details) => {
                        // Handle successful payment
                        setPaymentSuccess(true);
                        
                        // Call backend to complete the payment
                        fetch(`/api/payments/${data.orderID}/capture`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          }
                        })
                        .then(response => {
                          if (response.ok) {
                            navigate(`/payment-success?orderId=${data.orderID}`);
                          } else {
                            setPaymentError("Payment was approved but we had trouble processing it. Please contact support.");
                          }
                        })
                        .catch(() => {
                          setPaymentError("Payment was approved but we had trouble processing it. Please contact support.");
                        });
                      });
                    }
                    return Promise.resolve();
                  }}
                  onError={(err) => {
                    setPaymentError("PayPal encountered an error. Please try again or use a different payment method.");
                    console.error("PayPal error:", err);
                  }}
                />
              </PayPalScriptProvider>

              <Separator className="my-4" />
              
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={() => initiatePaymentMutation.mutate()}
                disabled={initiatePaymentMutation.isPending}
              >
                {initiatePaymentMutation.isPending ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    Processing...
                  </>
                ) : (
                  <>
                    Direct PayPal Checkout
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
            
            <CardFooter className="flex-col">
              <p className="text-sm text-muted-foreground">
                By completing this purchase, you agree to our Terms of Service and Privacy Policy.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
