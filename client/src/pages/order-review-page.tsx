import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function OrderReviewPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/auction/:id/review");
  const { toast } = useToast();
  const auctionId = params?.id ? parseInt(params.id) : null;

  const { data: auction, isLoading } = useQuery({
    queryKey: [`/api/auctions/${auctionId}`],
    enabled: !!auctionId
  });

  const handleApproveOrder = async () => {
    try {
      const response = await fetch(`/api/auctions/${auctionId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to approve order');
      }

      toast({
        title: "Order Approved",
        description: "You can now proceed with payment"
      });

      // Redirect to payment page
      setLocation(`/auction/${auctionId}/pay`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve order"
      });
    }
  };

  if (isLoading || !auction) {
    return <div>Loading...</div>;
  }

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
            <span>${(auction.currentPrice * 0.05 / 100).toFixed(2)}</span>
          </div>
          <div className="border-t pt-4 flex justify-between font-bold">
            <span>Total Amount:</span>
            <span>${(auction.currentPrice * 1.05 / 100).toFixed(2)}</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => setLocation(`/auction/${auctionId}`)}
        >
          Back to Auction
        </Button>
        <Button
          onClick={handleApproveOrder}
        >
          Approve and Proceed to Payment
        </Button>
      </div>
    </div>
  );
}
