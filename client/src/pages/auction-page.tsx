import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction, Bid } from "@shared/schema";
import BidForm from "@/components/bid-form";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export default function AuctionPage() {
  const [, params] = useRoute("/auction/:id");
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState("");

  const { data: auction, isLoading: isLoadingAuction } = useQuery<Auction>({
    queryKey: [`/api/auctions/${params?.id}`],
  });

  const { data: bids } = useQuery<Bid[]>({
    queryKey: [`/api/auctions/${params?.id}/bids`],
    enabled: !!auction,
  });

  useEffect(() => {
    if (!auction) return;

    const updateTimer = () => {
      const now = new Date();
      const end = new Date(auction.endDate);
      const start = new Date(auction.startDate);

      if (now < start) {
        setTimeLeft(`Starts ${formatDistanceToNow(start, { addSuffix: true })}`);
      } else if (now > end) {
        setTimeLeft("Auction ended");
      } else {
        const seconds = differenceInSeconds(end, now);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        setTimeLeft(
          `${days}d ${hours}h ${minutes}m ${remainingSeconds}s remaining`
        );
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [auction]);

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
  const reserveMet = auction.currentPrice >= auction.reservePrice;

  return (
    <div className="container mx-auto py-8">
      <Link href="/">
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Auctions
        </Button>
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          {auction.mediaUrls && auction.mediaUrls.length > 0 && (
            auction.mediaUrls[0].toLowerCase().endsWith('.mp4') ? (
              <video
                src={auction.mediaUrls[0]}
                className="w-full rounded-lg object-cover aspect-square"
                controls
              />
            ) : (
              <img
                src={auction.mediaUrls[0]}
                alt={auction.title}
                className="w-full rounded-lg object-cover aspect-square"
              />
            )
          )}
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{auction.title}</h1>
            <div className="flex gap-2 mt-2">
              <Badge>{auction.species}</Badge>
              <Badge variant="outline">{auction.category}</Badge>
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Active" : "Ended"}
              </Badge>
              {isActive && (
                <Badge variant={reserveMet ? "default" : "destructive"}>
                  {reserveMet ? "Reserve Met" : "Reserve Not Met"}
                </Badge>
              )}
            </div>
          </div>

          <div className="prose max-w-none">
            <p>{auction.description}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              <span>{timeLeft}</span>
            </div>
            <div className="text-lg">
              Current bid: <span className="font-bold">${auction.currentPrice}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Starting price: ${auction.startPrice}
            </div>
            <div className="text-sm text-muted-foreground">
              Reserve price: ${auction.reservePrice}
            </div>
          </div>

          {user && isActive && user.id !== auction.sellerId && (
            <BidForm
              auctionId={auction.id}
              currentPrice={auction.currentPrice}
            />
          )}

          {user && user.id === auction.sellerId && (
            <div className="text-sm text-muted-foreground">
              You cannot bid on your own auction
            </div>
          )}

          {bids && bids.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Bid History</h2>
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div
                    key={bid.id}
                    className="flex justify-between items-center p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <span className="font-medium">${bid.amount}</span>
                      {bid.bidderId === user?.id && (
                        <Badge variant="outline" className="ml-2">Your Bid</Badge>
                      )}
                    </div>
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