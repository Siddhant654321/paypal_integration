
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { centsToDollars, dollarsToCents } from "@/utils/formatters";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

type Props = {
  auctionId: number;
  currentPrice: number;
  onBidSuccess?: () => void;
};

export default function BidForm({ auctionId, currentPrice, onBidSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const bidMutation = useMutation({
    mutationFn: async (bidAmount: number) => {
      try {
        const response = await apiRequest("POST", `/api/auctions/${auctionId}/bid`, { 
          amount: dollarsToCents(bidAmount)
        });
        
        // Check if the response directly contains an error
        if (response && response.error === "profile_incomplete") {
          throw new Error("Profile incomplete");
        }
        
        return response;
      } catch (error: any) {
        console.error("Bid error details:", error);
        throw error;
      }
    },
    onSuccess: () => {
      setAmount("");
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });
      queryClient.invalidateQueries({ queryKey: ['/api/auctions'] });

      // Force refetch
      queryClient.refetchQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.refetchQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });
      
      // Call the success callback
      if (onBidSuccess) {
        onBidSuccess();
      }

      toast({
        title: "Bid placed successfully",
        description: "Your bid has been recorded",
      });
    },
    onError: (error: any) => {
      console.error("Bid error:", error);
      
      // Check for profile incomplete errors
      const errorData = error.response?.data;
      const errorMessage = error.message || "";
      
      // Comprehensive check for profile-related errors
      const isProfileIncompleteError = 
        errorMessage.includes("Profile incomplete") || 
        errorMessage.includes("profile before bidding") ||
        (errorData?.error === "profile_incomplete") ||
        (errorData?.message && errorData.message.includes("complete your profile"));
      
      if (isProfileIncompleteError) {
        console.log("Profile incomplete error detected");
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
          description: errorData?.message || errorMessage || "Failed to place bid",
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
        description: `Bid must be higher than the current price of $${currentPriceInDollars.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }
    
    bidMutation.mutate(bidAmount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col space-y-2">
        <div className="flex flex-row items-center space-x-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter bid amount"
              step="0.01"
              min={centsToDollars(currentPrice) + 0.01}
              className="w-full rounded-md border border-input bg-background px-8 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button type="submit" disabled={bidMutation.isPending}>
            {bidMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Bidding...
              </>
            ) : (
              "Place Bid"
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Current price: ${centsToDollars(currentPrice).toFixed(2)}
        </p>
      </div>
    </form>
  );
}
