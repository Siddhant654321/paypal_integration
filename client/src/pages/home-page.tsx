import { useQuery } from "@tanstack/react-query";
import AuctionCard from "@/components/auction-card";
import AuctionFilters from "@/components/auction-filters";
import { useState } from "react";
import { Auction } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

export default function HomePage() {
  const [filters, setFilters] = useState({
    species: "",
    category: "",
  });

  const { data: auctions, isLoading } = useQuery<Auction[]>({
    queryKey: [
      "/api/auctions",
      filters.species && `species=${filters.species}`,
      filters.category && `category=${filters.category}`,
    ].filter(Boolean),
  });

  const { user, logoutMutation } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-accent p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h2 className="text-2xl font-bold text-accent-foreground">
            Pips 'n Chicks
          </h2>
          <div className="flex gap-4">
            {user ? (
              <>
                <span className="text-accent-foreground">
                  Welcome, {user.username}!
                </span>
                {user.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="secondary">Admin Dashboard</Button>
                  </Link>
                )}
                {user.role === "seller" && (
                  <Link href="/seller/dashboard">
                    <Button variant="secondary">Seller Dashboard</Button>
                  </Link>
                )}
                <Button 
                  variant="secondary" 
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Logout
                </Button>
              </>
            ) : (
              <Link href="/auth">
                <Button>Login / Register</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div
        className="bg-cover bg-center h-64 relative"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1444858291040-58f756a3bdd6")',
        }}
      >
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <h1 className="text-4xl font-bold text-white text-center">
            Pips 'n Chicks Auctions
          </h1>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <AuctionFilters filters={filters} onFilterChange={setFilters} />

        {isLoading ? (
          <div className="flex justify-center my-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !auctions?.length ? (
          <div className="text-center my-8 text-muted-foreground">
            No auctions found
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}