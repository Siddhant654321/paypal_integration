
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Auction, Bid } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CreditCard, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

// Define the BidWithAuction type to match what the API returns
type BidWithAuction = Bid & {
  auction: Auction;
  isWinningBid: boolean;
  requiresPayment: boolean;
};

export default function UserBidsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch user bids data
  const { data: bids, isLoading } = useQuery<BidWithAuction[]>({
    queryKey: ["/api/user/bids"],
  });

  // Filter bids based on search term
  const filteredBids = bids?.filter(bid => 
    bid.auction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bid.auction.species.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">My Bids</h1>

      {/* Search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search auctions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Bids listing */}
      {isLoading ? (
        <div className="text-center">Loading your bids...</div>
      ) : !filteredBids?.length ? (
        <div className="text-center text-muted-foreground">
          You haven't placed any bids yet.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBids.map((bid) => (
            <Card key={bid.id} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">{bid.auction.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {bid.auction.species} - {bid.auction.category}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <p className="font-bold">${bid.amount}</p>
                    {bid.isWinningBid && (
                      <Badge className="ml-2">
                        {bid.auction.paymentStatus === "completed"
                          ? "Paid"
                          : "Winner"}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm">
                  Bid placed {formatDistanceToNow(new Date(bid.timestamp), { addSuffix: true })}
                </p>
                <p className="text-sm">
                  Auction status: {bid.auction.status}
                </p>
              </CardContent>
              <CardFooter className="p-6 pt-0 flex justify-between">
                <Link href={`/auction/${bid.auction.id}`}>
                  <Button variant="secondary">View Auction</Button>
                </Link>
                {bid.requiresPayment && (
                  <Link href={`/auction/${bid.auction.id}/pay`}>
                    <Button size="sm" variant="default">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Pay Now
                    </Button>
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
