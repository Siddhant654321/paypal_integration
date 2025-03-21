import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import PaymentButton from "@/components/PaymentButton"; // Changed to default import

export default function OrderReviewPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/auction/:id/review");
  const { toast } = useToast();
  const auctionId = params?.id ? parseInt(params.id) : null;

  const { data: auction, isLoading } = useQuery({
    queryKey: [`/api/auctions/${auctionId}`],
    enabled: !!auctionId
  });

  if (isLoading || !auction) {
    return <div>Loading...</div>;
  }

  // Calculate total with platform fee
  const platformFee = Math.round(auction.currentPrice * 0.05);
  const totalAmount = auction.currentPrice + platformFee;

  return (
    <div className="container max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Review Your Purchase</h1>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Order Details</h2>
        <div className="space-y-4">
          <div className="flex justify-between">
            <span>Item:</span>
            <span>{auction.title}</span>
          </div>
          <div className="flex justify-between">
            <span>Price:</span>
            <span>${(auction.currentPrice / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Platform Fee:</span>
            <span>${(platformFee / 100).toFixed(2)}</span>
          </div>
          <div className="border-t pt-4 flex justify-between font-bold">
            <span>Total Amount:</span>
            <span>${(totalAmount / 100).toFixed(2)}</span>
          </div>
        </div>
      </Card>

      <div className="mt-6">
        <PaymentButton 
          auctionId={auctionId} 
          amount={totalAmount}
          onSuccess={() => {
            toast({
              title: "Payment Successful",
              description: "Your payment has been processed successfully."
            });
            setLocation(`/payment-success`);
          }}
          onError={(error) => {
            toast({
              variant: "destructive",
              title: "Payment Failed",
              description: error
            });
          }}
        />
      </div>

      <div className="mt-4">
        <Button
          variant="outline"
          onClick={() => setLocation(`/auction/${auctionId}`)}
          className="w-full"
        >
          Back to Auction
        </Button>
      </div>
    </div>
  );
}