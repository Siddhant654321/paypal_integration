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
      const bidData = insertBidSchema.parse({
        auctionId,
        amount: bidAmount,
      });
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
    onError: (error: Error) => {
      toast({
        title: "Failed to place bid",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bidAmount = parseInt(amount);
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
          min={currentPrice + 1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Enter amount higher than $${currentPrice}`}
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
