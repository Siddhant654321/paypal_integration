import { useState } from "react";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "wouter";
import { placeBid } from "@/services/auction-service";
import { Loader2 } from "lucide-react";

interface PlaceBidProps {
  auctionId: number;
  currentPrice: number;
  onBidPlaced?: () => void;
}

export function PlaceBid({ auctionId, currentPrice, onBidPlaced }: PlaceBidProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      amount: ((currentPrice / 100) + 1).toString() // Set default to current price + $1
    }
  });

  const onSubmit = async (data: { amount: string }) => {
    try {
      setIsSubmitting(true);
      const amount = Math.round(parseFloat(data.amount) * 100); // Convert to cents

      await placeBid(auctionId, amount);
      
      toast({
        title: "Success",
        description: "Bid placed successfully!",
      });

      if (onBidPlaced) {
        onBidPlaced();
      }
    } catch (error: any) {
      console.error("[BID] Error placing bid:", error);

      if (error.message?.includes("Profile incomplete")) {
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
          description: error.message || "Failed to place bid",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex gap-2">
        <Input
          {...form.register("amount")}
          type="number"
          step="0.01"
          min={(currentPrice / 100) + 1}
          placeholder="Enter bid amount"
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Place Bid
        </Button>
      </div>
    </form>
  );
}
