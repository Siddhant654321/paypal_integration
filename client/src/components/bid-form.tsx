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
import { useNavigate } from "react-router-dom";

type Props = {
  auctionId: number;
  currentPrice: number;
  onBidSuccess?: () => void;
};

export default function BidForm({ auctionId, currentPrice, onBidSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const bidMutation = useMutation({
    mutationFn: async (bidAmount: number) => {
      const bidData = {
        auctionId,
        amount: dollarsToCents(bidAmount), // Convert dollars to cents for storage
      };
      const res = await apiRequest("POST", `/api/auctions/${auctionId}/bid`, bidData);
      return res.json();
    },
    onSuccess: () => {
      setAmount("");
      // Log success message
      console.log("Bid placed successfully for auction:", auctionId);

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });
      queryClient.invalidateQueries({ queryKey: ['/api/auctions'] });

      // Force refetch the auction and bids data
      queryClient.refetchQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.refetchQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });

      // Notify parent component after the invalidation
      if (onBidSuccess) {
        setTimeout(() => {
          onBidSuccess();
        }, 100); // Small delay to ensure invalidation completes
      }

      toast({
        title: "Bid placed successfully",
        description: "Your bid has been recorded",
      });
    },
    onError: (error: any) => {
      // Check for different types of profile-related errors
      if (
        error.message?.includes("Profile incomplete") || 
        error.message?.includes("profile before bidding") ||
        (error.response?.data?.error === "profile_incomplete") ||
        (error.response?.data?.message?.includes("complete your profile"))
      ) {
        toast({
          title: "Profile Required",
          description: "Please complete your profile before bidding. Click here to update your profile.",
          variant: "destructive",
          action: (
            <Button
              variant="outline"
              onClick={() => navigate("/profile")}
            >
              Update Profile
            </Button>
          ),
        });
      } else {
        toast({
          title: "Error",
          description: error.response?.data?.message || error.message || "Failed to place bid",
          variant: "destructive",
        });
      }
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