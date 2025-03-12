import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { type Auction } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Store, MapPin, CreditCard, Check, X, Eye } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "../utils/formatters";
import React from 'react';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  auction: Auction;
  showStatus?: boolean;
  actions?: React.ReactNode;
};

// Helper function to get a valid image URL from auction
function getValidImageUrl(auction: Auction): string {
  // First check if there's a valid imageUrl
  if (auction.imageUrl && auction.imageUrl.trim() !== '') {
    // Ensure URL has proper protocol
    if (!auction.imageUrl.startsWith('http') && !auction.imageUrl.startsWith('/')) {
      return `/uploads/${auction.imageUrl}`;
    }
    return auction.imageUrl;
  }

  // Then check for images array
  if (auction.images && Array.isArray(auction.images) && auction.images.length > 0) {
    const firstImage = auction.images[0];
    if (firstImage && firstImage.trim() !== '') {
      // Ensure URL has proper protocol
      if (!firstImage.startsWith('http') && !firstImage.startsWith('/')) {
        return `/uploads/${firstImage}`;
      }
      return firstImage;
    }
  }

  // Return a placeholder if no valid image is found
  return '/images/placeholder.jpg';
}

export default function AuctionCard({ auction, showStatus = false, actions }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();
  const startDate = new Date(auction.startDate);
  const endDate = new Date(auction.endDate);
  const isActive = now >= startDate && now <= endDate;
  const isUpcoming = now < startDate;

  // Check if current user is the winning bidder and payment is pending
  const isWinningBidder = user?.id === auction.winningBidderId;
  const isSeller = user?.id === auction.sellerId;
  const needsPayment = isWinningBidder && auction.paymentStatus === "pending";
  const isPendingSellerDecision = auction.status === "pending_seller_decision";

  console.log(`[AuctionCard] Auction #${auction.id} status check:`, {
    status: auction.status,
    currentPrice: auction.currentPrice,
    reservePrice: auction.reservePrice,
    isPendingSellerDecision,
    winningBidderId: auction.winningBidderId,
    isSeller,
    isWinningBidder
  });

  const getStatusBadge = () => {
    if (auction.status === "pending_seller_decision") {
      return <Badge variant="warning">Pending Seller Decision</Badge>;
    }
    if (showStatus) {
      return (
        <Badge variant={auction.approved ? "default" : "secondary"}>
          {auction.approved ? "Approved" : "Pending Approval"}
        </Badge>
      );
    }
    if (auction.status === "voided") {
      return <Badge variant="destructive">Voided</Badge>;
    }
    return null;
  };

  const handleSellerDecision = async (accept: boolean) => {
    try {
      const response = await apiRequest(
        "POST",
        `/api/auctions/${auction.id}/seller-decision`,
        { accept }
      );

      if (!response.ok) {
        throw new Error("Failed to process decision");
      }

      toast({
        title: accept ? "Bid Accepted" : "Auction Voided",
        description: accept
          ? "The buyer will be notified to complete payment"
          : "The auction has been voided",
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auction.id}`] });

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process your decision. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square w-full bg-muted rounded-md overflow-hidden">
        <img
          src={getValidImageUrl(auction)}
          alt={auction.title}
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.src = '/images/placeholder.jpg';
          }}
        />
      </div>
      <CardContent className="p-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          <Badge>{auction.species}</Badge>
          <Badge variant="outline">
            {auction.category}
          </Badge>
          {getStatusBadge()}
        </div>
        <h3 className="text-lg font-semibold mb-2">{auction.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-line">
          {auction.description}
        </p>
        <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" />
          <span>{auction.views || 0} views</span>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-col gap-2">
        <div className="flex w-full justify-between items-center">
          <div>
            <div className="font-semibold">${(auction.currentPrice / 100).toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">
              {isUpcoming
                ? "Starts " + formatDistanceToNow(startDate, { addSuffix: true })
                : isActive
                  ? "Ends " + formatDistanceToNow(endDate, { addSuffix: true })
                  : "Ended " + formatDistanceToNow(endDate, { addSuffix: true })
              }
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {actions}
            {!isPendingSellerDecision && auction.status !== "voided" && (
              <Link href={`/auction/${auction.id}`}>
                <Button variant="secondary">View Details</Button>
              </Link>
            )}
          </div>
        </div>

        {/* Show seller decision buttons if pending seller decision */}
        {isPendingSellerDecision && isSeller && (
          <div className="flex gap-2 w-full mt-2">
            <Button
              onClick={() => handleSellerDecision(true)}
              className="flex-1"
              variant="default"
            >
              <Check className="mr-2 h-4 w-4" />
              Accept Bid
            </Button>
            <Button
              onClick={() => handleSellerDecision(false)}
              className="flex-1"
              variant="destructive"
            >
              <X className="mr-2 h-4 w-4" />
              Void Auction
            </Button>
          </div>
        )}

        {/* Only show Pay Now button to the auction winner when payment is needed */}
        {auction.status === "ended" && needsPayment && (
          <Link href={`/auction/${auction.id}/pay`}>
            <Button size="sm" className="w-full" variant="default">
              <CreditCard className="mr-2 h-4 w-4" />
              Pay Now
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}