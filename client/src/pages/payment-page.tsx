import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface PaymentResponse {
  clientSecret: string;
  payment: {
    amount: number;
    platformFee: number;
    sellerPayout: number;
  };
}

export default function PaymentPage() {
  const [, params] = useRoute("/auction/:id/pay");

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: paymentData, isLoading: isLoadingPayment } = useQuery<PaymentResponse>({
    queryKey: [`/api/auctions/${params?.id}/pay`],
    enabled: !!auction?.id,
  });

  useEffect(() => {
    if (!paymentData?.clientSecret) return;

    const initializePayment = async () => {
      const stripe = await stripePromise;
      if (!stripe) return;

      const { error } = await stripe.confirmCardPayment(paymentData.clientSecret);
      if (error) {
        console.error('Payment error:', error);
      }
    };

    initializePayment();
  }, [paymentData]);

  if (isLoadingAuction || isLoadingPayment) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex justify-center items-center min-h-screen text-muted-foreground">
        Auction not found
      </div>
    );
  }

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
        <CardContent className="space-y-4">
          <div className="text-lg font-medium">
            {auction.title}
          </div>
          <div className="text-2xl font-bold">
            Total Amount: ${auction.currentPrice}
          </div>
          <div className="text-sm text-muted-foreground">
            Winning bid amount: ${auction.currentPrice}
          </div>
          <Button className="w-full" size="lg">
            <CreditCard className="h-5 w-5 mr-2" />
            Pay with Stripe
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}