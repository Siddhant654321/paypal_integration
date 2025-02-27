import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Auction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link, Redirect } from "wouter";
import AuctionCard from "@/components/auction-card";

export default function SellerDashboard() {
  const { user } = useAuth();

  // Redirect if not a seller or seller_admin
  if (!user || (user.role !== "seller" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  const { data: auctions, isLoading } = useQuery<Auction[]>({
    queryKey: [`/api/seller/auctions`],
  });

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

      {isLoading ? (
        <div className="text-center">Loading your auctions...</div>
      ) : !auctions?.length ? (
        <div className="text-center text-muted-foreground">
          You haven't created any auctions yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {auctions.map((auction) => (
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