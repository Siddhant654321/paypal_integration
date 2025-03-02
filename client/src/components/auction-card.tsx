import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { type Auction } from "@shared/schema";

// Helper function to get a valid image URL from auction
function getValidImageUrl(auction: any): string {
  // First check if there's a valid imageUrl
  if (auction.imageUrl && auction.imageUrl.trim() !== '') {
    // Ensure URL has proper protocol
    if (!auction.imageUrl.startsWith('http') && !auction.imageUrl.startsWith('/')) {
      return `/${auction.imageUrl}`;
    }
    return auction.imageUrl;
  }
  
  // Then check for images array
  if (auction.images && Array.isArray(auction.images) && auction.images.length > 0) {
    const firstImage = auction.images[0];
    if (firstImage && firstImage.trim() !== '') {
      // Ensure URL has proper protocol
      if (!firstImage.startsWith('http') && !firstImage.startsWith('/')) {
        return `/${firstImage}`;
      }
      return firstImage;
    }
  }
  
  // Return a placeholder if no valid image is found
  return '/images/placeholder.jpg';
}


import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Store, MapPin, CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "../utils/formatters";

type Props = {
  auction: Auction;
  showStatus?: boolean;
};

export default function AuctionCard({ auction, showStatus }: Props) {
  const { user } = useAuth();
  const isActive = new Date() >= new Date(auction.startDate) && new Date() <= new Date(auction.endDate);

  // Check if current user is the winning bidder and payment is pending
  const isWinningBidder = user?.id === auction.winningBidderId;
  const needsPayment = isWinningBidder && auction.paymentStatus === "pending";

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square w-full overflow-hidden bg-muted">
        <img
          src={getValidImageUrl(auction)}
          alt={auction.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = '/images/placeholder.jpg'; // Set a fallback image
          }}
        />
      </div>
      <CardContent className="p-4">
        <div className="flex gap-2 mb-2">
          <Badge>{auction.species}</Badge>
          <Badge variant="outline">
            {auction.category}
          </Badge>
          {showStatus && (
            <Badge variant={auction.approved ? "default" : "secondary"}>
              {auction.approved ? "Approved" : "Pending Approval"}
            </Badge>
          )}
        </div>
        <h3 className="text-lg font-semibold mb-2">{auction.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {auction.description}
        </p>
        {auction.sellerProfile && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Store className="h-4 w-4" />
              <span>{auction.sellerProfile.businessName || "Anonymous Seller"}</span>
            </div>
            {auction.sellerProfile.state && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <MapPin className="h-3 w-3" />
                <span>Shipping from {auction.sellerProfile.state}</span>
              </div>
            )}
            {auction.sellerProfile.breedSpecialty && (
              <p className="text-xs text-muted-foreground mt-1">
                Specializes in: {auction.sellerProfile.breedSpecialty}
              </p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-col gap-2">
        <div className="flex w-full justify-between items-center">
          <div>
            <div className="font-semibold">${(auction.currentPrice / 100).toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">
              {isActive
                ? `Ends ${formatDistanceToNow(new Date(auction.endDate), {
                    addSuffix: true,
                  })}`
                : "Auction ended"}
            </div>
          </div>
          <Link href={`/auction/${auction.id}`}>
            <Button variant="secondary">View Details</Button>
          </Link>
        </div>

        {/* Only show Pay Now button to the auction winner */}
        {auction.status === "ended" && isWinningBidder && needsPayment && (
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