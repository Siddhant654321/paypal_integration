import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Auction } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Search, CreditCard } from "lucide-react";
import { useState } from "react";
import AuctionCard from "@/components/auction-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

type BidWithAuction = {
  id: number;
  auctionId: number;
  bidderId: number;
  amount: number;
  timestamp: Date;
  auction: Auction;
  isWinningBid: boolean;
  requiresPayment: boolean;
};

export default function BuyerDashboard() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: bidsWithAuctions, isLoading } = useQuery<BidWithAuction[]>({
    queryKey: ["/api/user/bids"],
  });

  const filteredBids = bidsWithAuctions?.filter(bid =>
    bid.auction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bid.auction.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">My Bids</h1>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search auctions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="text-center">Loading your bids...</div>
      ) : !filteredBids?.length ? (
        <div className="text-center text-muted-foreground">
          You haven't placed any bids yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBids.map((bid) => (
            <div key={bid.id} className="relative">
              {bid.isWinningBid && (
                <div className="absolute top-2 right-2 z-10 flex gap-2">
                  <Badge variant="secondary">You won!</Badge>
                  {bid.requiresPayment && (
                    <Link href={`/auction/${bid.auction.id}/pay`}>
                      <Button size="sm" variant="default" className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pay Now
                      </Button>
                    </Link>
                  )}
                </div>
              )}
              <AuctionCard 
                auction={bid.auction}
                showStatus={true}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}