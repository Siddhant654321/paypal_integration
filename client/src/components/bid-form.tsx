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
import { useLocation } from "wouter";

type Props = {
  auctionId: number;
  currentPrice: number;
  onBidSuccess?: () => void;
};

export default function BidForm({ auctionId, currentPrice, onBidSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const bidMutation = useMutation({
    mutationFn: async (bidAmount: number) => {
      const amountInCents = dollarsToCents(bidAmount);
      try {
        const response = await apiRequest("POST", `/api/auctions/${auctionId}/bid`, { amount: amountInCents });
        // Check if the response contains a profile error message
        if (response.error === "profile_incomplete") {
          throw new Error("Profile incomplete");
        }
        return response;
      } catch (error: any) {
        // Re-throw the error so it goes to onError handler
        throw error;
      }
    },
    onSuccess: () => {
      setAmount("");
      onBidSuccess?.();
      toast({
        title: "Bid placed successfully",
        description: "Your bid has been recorded",
      });
    },
    onError: (error: any) => {
      console.error("Bid error:", error);

      // Check for profile-related errors with more thorough checks
      const errorResponse = error.response?.data;
      const errorMessage = error.message || "";

      if (
        errorMessage.includes("Profile incomplete") || 
        errorMessage.includes("profile before bidding") ||
        (errorResponse?.error === "profile_incomplete") ||
        (errorResponse?.message && errorResponse.message.includes("complete your profile"))
      ) {
        toast({
          title: "Profile Required",
          description: "Please complete your profile before bidding.",
          variant: "destructive",
          action: (
            <Button
              variant="outline"
              onClick={() => setLocation("/profile")}
            >
              Update Profile
            </Button>
          ),
        });
      } else {
        toast({
          title: "Error",
          description: errorResponse?.message || errorMessage || "Failed to place bid",
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