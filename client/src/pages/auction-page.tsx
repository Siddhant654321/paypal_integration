import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Auction, Bid, Profile } from "@shared/schema";
import BidForm from "@/components/bid-form";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Clock, Store, User, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

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
        <div className="space-y-4">
          {/* Main image */}
          <div className="aspect-square w-full overflow-hidden rounded-lg">
            <img
              src={auction.imageUrl}
              alt={auction.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Thumbnails */}
          {auction.images && auction.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {auction.images.map((img, index) => (
                <div key={index} className="aspect-square overflow-hidden rounded cursor-pointer">
                  <img
                    src={img}
                    alt={`${auction.title} - Image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Seller Information Card */}
          {auction.sellerProfile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">About the Seller</CardTitle>
                <CardDescription>
                  Learn more about this seller and their specialties
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  <span className="font-medium">
                    {auction.sellerProfile.businessName || "Anonymous Seller"}
                  </span>
                </div>

                {auction.sellerProfile.state && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
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