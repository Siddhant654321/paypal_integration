import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Auction } from "@shared/schema";
import { Redirect } from "wouter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";
import AuctionCard from "@/components/auction-card";

export default function BuyerDashboard() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // No need to redirect as all users can bid now
  const { data: biddingOn, isLoading } = useQuery<Auction[]>({
    queryKey: ["/api/user/bids"],
  });

  const filteredAuctions = biddingOn?.filter(auction =>
    auction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    auction.description.toLowerCase().includes(searchTerm.toLowerCase())
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
      ) : !filteredAuctions?.length ? (
        <div className="text-center text-muted-foreground">
          You haven't placed any bids yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAuctions.map((auction) => (
            <AuctionCard 
              key={auction.id} 
              auction={auction}
              showStatus={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
