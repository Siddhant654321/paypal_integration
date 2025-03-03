import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { insertBidSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { dollarsToCents, formatDollarInput, formatPrice, centsToDollars } from "@/utils/formatters";

type Props = {
  auctionId: number;
  currentPrice: number;
  onBidSuccess?: () => void;
};

export default function BidForm({ auctionId, currentPrice, onBidSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const { toast } = useToast();

  const bidMutation = useMutation({
    mutationFn: async (bidAmount: number) => {
      const bidData = {
        auctionId,
        amount: dollarsToCents(bidAmount), // Convert dollars to cents for storage
      };

      // apiRequest already returns parsed JSON
      return await apiRequest("POST", `/api/auctions/${auctionId}/bid`, bidData);
    },
    onSuccess: () => {
      setAmount("");
      console.log("Bid placed successfully for auction:", auctionId);

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });
      queryClient.invalidateQueries({ queryKey: ['/api/auctions'] });

      // Force refetch the auction and bids data
      queryClient.refetchQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.refetchQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });

      // Notify parent component
      if (onBidSuccess) {
        onBidSuccess();
      }

      toast({
        title: "Success",
        description: "Your bid has been placed successfully",
      });
    },
    onError: (error: Error) => {
      console.error("[BidForm] Error placing bid:", error);

      toast({
        title: "Failed to place bid",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bidAmount = parseFloat(amount);
    const currentPriceInDollars = centsToDollars(currentPrice);

    if (isNaN(bidAmount) || bidAmount <= currentPriceInDollars) {
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
          type="text"
          value={amount}
          onChange={(e) => setAmount(formatDollarInput(e.target.value))}
          onBlur={() => {
            // Format to proper dollar amount on blur
            const value = parseFloat(amount) || 0;
            setAmount(value.toFixed(2));
          }}
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