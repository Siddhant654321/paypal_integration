import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Auction, Bid } from "@shared/schema";
import BidForm from "@/components/bid-form";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function AuctionPage() {
  const [, params] = useRoute("/auction/:id");
  const { user } = useAuth();

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: bids } = useQuery<Bid[]>({
    queryKey: [`/api/auctions/${params?.id}/bids`],
    enabled: !!auction,
  });

  if (isLoadingAuction) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex justify-center items-center min-h-screen text-muted-foreground">
        Auction not found
      </div>
    );
  }

  const isActive = new Date() >= new Date(auction.startDate) && new Date() <= new Date(auction.endDate);

  return (
    <div className="container mx-auto py-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <img
            src={auction.imageUrl}
            alt={auction.title}
            className="w-full rounded-lg object-cover aspect-square"
          />
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{auction.title}</h1>
            <div className="flex gap-2 mt-2">
              <Badge>{auction.species}</Badge>
              <Badge variant="outline">{auction.category}</Badge>
            </div>
          </div>

          <div className="prose max-w-none">
            <p>{auction.description}</p>
          </div>

          <div className="space-y-2">
            <div className="text-lg">
              Current bid: <span className="font-bold">${auction.currentPrice}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {isActive
                ? `Ends ${formatDistanceToNow(new Date(auction.endDate), {
                    addSuffix: true,
                  })}`
                : "Auction ended"}
            </div>
          </div>

          {user?.role === "buyer" && isActive && (
            <BidForm
              auctionId={auction.id}
              currentPrice={auction.currentPrice}
            />
          )}

          {bids && bids.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Bid History</h2>
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div
                    key={bid.id}
                    className="flex justify-between items-center p-2 bg-muted rounded"
                  >
                    <span>${bid.amount}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(bid.timestamp), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
