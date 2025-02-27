import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Link, Redirect } from "wouter";
import AuctionCard from "@/components/auction-card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SellerDashboard() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // Redirect if not a seller or seller_admin
  if (!user || (user.role !== "seller" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  const { data: auctions, isLoading } = useQuery<Auction[]>({
    queryKey: [`/api/seller/auctions`],
  });

  const { data: biddingOn, isLoading: isLoadingBids } = useQuery<Auction[]>({
    queryKey: ["/api/user/bids"],
  });

  const filteredAuctions = auctions?.filter(auction =>
    auction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    auction.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBiddingOn = biddingOn?.filter(auction =>
    auction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    auction.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingAuctions = filteredAuctions?.filter(auction => !auction.approved);
  const approvedAuctions = filteredAuctions?.filter(auction => auction.approved);

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Auctions</h1>
        <Link href="/seller/new-auction">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create New Auction
          </Button>
        </Link>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search auctions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="myAuctions">
        <TabsList className="w-full">
          <TabsTrigger value="myAuctions">My Auctions</TabsTrigger>
          <TabsTrigger value="biddingOn">Bidding On ({biddingOn?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="myAuctions">
          {isLoading ? (
            <div className="text-center">Loading your auctions...</div>
          ) : !auctions?.length ? (
            <div className="text-center text-muted-foreground">
              You haven't created any auctions yet.
            </div>
          ) : (
            <Tabs defaultValue="approved">
              <TabsList className="w-full">
                <TabsTrigger value="approved">
                  Active Auctions ({approvedAuctions?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending Approval ({pendingAuctions?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="approved">
                {!approvedAuctions?.length ? (
                  <div className="text-center text-muted-foreground">
                    No approved auctions found
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {approvedAuctions.map((auction) => (
                      <AuctionCard 
                        key={auction.id} 
                        auction={auction}
                        showStatus={true}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pending">
                {!pendingAuctions?.length ? (
                  <div className="text-center text-muted-foreground">
                    No pending auctions found
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pendingAuctions.map((auction) => (
                      <AuctionCard 
                        key={auction.id} 
                        auction={auction}
                        showStatus={true}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="biddingOn">
          {isLoadingBids ? (
            <div className="text-center">Loading auctions you're bidding on...</div>
          ) : !filteredBiddingOn?.length ? (
            <div className="text-center text-muted-foreground">
              You haven't placed any bids yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBiddingOn.map((auction) => (
                <AuctionCard 
                  key={auction.id} 
                  auction={auction}
                  showStatus={true}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}