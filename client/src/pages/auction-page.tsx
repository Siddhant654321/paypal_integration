import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction, Bid, Profile } from "@shared/schema";
import BidForm from "@/components/bid-form";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Clock, Store, User, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { formatPrice, centsToDollars } from "../utils/formatters";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AuctionPage() {
  const [, params] = useRoute("/auction/:id");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [timeLeft, setTimeLeft] = useState("");

  const { data: auction, isLoading: isLoadingAuction, refetch: refetchAuction } = useQuery<Auction & { sellerProfile?: Profile }>({
    queryKey: [`/api/auctions/${params?.id}`],
    refetchInterval: 5000, // Refetch every 5 seconds to keep data fresh
  });

  const { data: bids = [], isLoading: isLoadingBids, refetch: refetchBids } = useQuery<Bid[]>({
    queryKey: [`/api/auctions/${params?.id}/bids`],
    enabled: !!auction,
    refetchInterval: 5000, // Refetch every 5 seconds to keep data fresh
  });

  useEffect(() => {
    if (!auction) return;

    const updateTimer = () => {
      const now = new Date();
      const end = new Date(auction.endDate);
      const start = new Date(auction.startDate);

      if (now < start) {
        setTimeLeft(`Starts ${formatDistanceToNow(start, { addSuffix: true })}`);
      } else if (now > end && auction.status === "active") {
        fetch(`/api/auctions/${auction.id}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auction.id}`] });
        });
        setTimeLeft("Auction ended");
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
  }, [auction, queryClient]);

  const handleSellerDecision = async (decision: "accept" | "void") => {
    try {
      await fetch(`/api/auctions/${auction?.id}/seller-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ decision })
      });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auction?.id}`] });
    } catch (error) {
      console.error("Error making seller decision:", error);
    }
  };

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
  const showSellerDecision = auction.status === "pending_seller_decision" && user?.id === auction.sellerId;

  const getStatusBadge = () => {
    switch (auction.status) {
      case "active":
        return <Badge>Active</Badge>;
      case "ended":
        return <Badge variant="secondary">{auction.winningBidderId ? "Sold" : "Ended"}</Badge>;
      case "pending_seller_decision":
        return <Badge variant="secondary">Awaiting Seller Decision</Badge>;
      case "voided":
        return <Badge variant="destructive">Voided</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <Link href="/">
        <Button variant="ghost" className="mb-4 md:mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Auctions
        </Button>
      </Link>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8">
        <div className="space-y-4 md:space-y-6">
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
            <img
              src={auction.imageUrl && auction.imageUrl.trim() !== '' ?
                (auction.imageUrl.startsWith('http') || auction.imageUrl.startsWith('/') ?
                  auction.imageUrl : `/uploads/${auction.imageUrl}`) :
                (auction.images && Array.isArray(auction.images) && auction.images.length > 0 ?
                  (auction.images[0].startsWith('http') || auction.images[0].startsWith('/') ?
                    auction.images[0] : `/uploads/${auction.images[0]}`) :
                  '/images/placeholder.jpg')}
              alt={auction.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = '/images/placeholder.jpg';
              }}
            />
          </div>

          {auction.images && auction.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {auction.images.map((img, index) => (
                <div key={index} className="aspect-square overflow-hidden rounded cursor-pointer">
                  <img
                    src={img.startsWith('http') || img.startsWith('/') ? img : `/uploads/${img}`}
                    alt={`${auction.title} - Image ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/images/placeholder.jpg';
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {auction.sellerProfile && (
            <Card>
              <CardHeader className="space-y-1.5">
                <CardTitle className="text-lg">About the Seller</CardTitle>
                <CardDescription>
                  Learn more about this seller and their specialties
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">
                    {auction.sellerProfile.businessName || "Anonymous Seller"}
                  </span>
                </div>

                {auction.sellerProfile.state && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>Shipping from {auction.sellerProfile.state}</span>
                  </div>
                )}

                {auction.sellerProfile.breedSpecialty && (
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Breed Specialty</p>
                    <p className="text-sm text-muted-foreground">
                      {auction.sellerProfile.breedSpecialty}
                    </p>
                  </div>
                )}

                {auction.sellerProfile.isPublicBio && auction.sellerProfile.bio && (
                  <div className="space-y-1">
                    <p className="font-medium text-sm">About Us</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {auction.sellerProfile.bio}
                    </p>
                  </div>
                )}

                {auction.sellerProfile.npipNumber && (
                  <div className="space-y-1">
                    <p className="font-medium text-sm">NPIP Certification</p>
                    <p className="text-sm text-muted-foreground">
                      NPIP Number: {auction.sellerProfile.npipNumber}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <h1 className="text-2xl md:text-3xl font-bold">{auction.title}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge>{auction.species}</Badge>
              <Badge variant="outline">
                {auction.category}
              </Badge>
              {getStatusBadge()}
              {auction.status === "active" && (
                <Badge variant={auction.currentPrice >= auction.reservePrice ? "default" : "destructive"}>
                  {auction.currentPrice >= auction.reservePrice ? "Reserve Met" : "Reserve Not Met"}
                </Badge>
              )}
            </div>
          </div>

          <div className="prose max-w-none">
            <p>{auction.description}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 flex-shrink-0" />
              <span>{timeLeft}</span>
            </div>
            <div className="text-lg">
              Current bid: <span className="font-bold">{formatPrice(auction.currentPrice)}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Starting price: {formatPrice(auction.startPrice)}
            </div>
            <div className="text-sm text-muted-foreground">
              Total bids: {bids.length}
            </div>
          </div>

          {user && isActive && user.id !== auction.sellerId && (
            <BidForm
              auctionId={auction.id}
              currentPrice={auction.currentPrice}
              onBidSuccess={() => {
                refetchAuction();
                refetchBids();
              }}
            />
          )}

          {user && user.id === auction.sellerId && (
            <div className="text-sm text-muted-foreground">
              You cannot bid on your own auction
            </div>
          )}

          {bids && bids.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Bid History</h2>
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div
                    key={bid.id}
                    className="flex justify-between items-center p-3 bg-muted rounded-lg"
                  >
                    <div className="space-y-1">
                      <span className="font-medium">{formatPrice(bid.amount)}</span>
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