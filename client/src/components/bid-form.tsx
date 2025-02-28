import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { insertBidSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Props = {
  auctionId: number;
  currentPrice: number;
};

export default function BidForm({ auctionId, currentPrice }: Props) {
  const [amount, setAmount] = useState("");
  const { toast } = useToast();

  const bidMutation = useMutation({
    mutationFn: async (bidAmount: number) => {
      // We don't need to include bidderId here as it will be set by the server from the authenticated user
      const bidData = {
        auctionId,
        amount: bidAmount,
      };
      const res = await apiRequest("POST", `/api/auctions/${auctionId}/bid`, bidData);
      return res.json();
    },
    onSuccess: () => {
      setAmount("");
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });
      toast({
        title: "Bid placed successfully",
        description: "Your bid has been recorded",
      });
    },
    onError: (error: any) => {
      let errorMessage = "An unexpected error occurred";
      
      if (error.message) {
        errorMessage = error.message;
      }
      
      // Try to extract more detailed error from response if available
      if (error.response) {
        try {
          const responseData = error.response.json();
          if (responseData && responseData.message) {
            errorMessage = responseData.message;
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
      }
      
      toast({
        title: "Failed to place bid",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bidAmount = Math.round(parseFloat(amount) * 100);
    if (isNaN(bidAmount) || bidAmount <= currentPrice) {
      toast({
        title: "Invalid bid amount",
        description: "Bid must be higher than the current price",
        variant: "destructive",
      });
      return;
    }
    bidMutation.mutate(bidAmount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bid-amount">Your Bid Amount ($)</Label>
        <Input
          id="bid-amount"
          type="number"
          step="0.01"
          min={(currentPrice / 100) + 0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Enter amount higher than ${formatPrice(currentPrice)}`}
          required
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={bidMutation.isPending}
      >
        {bidMutation.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Place Bid
      </Button>
    </form>
  );
}
