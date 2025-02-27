import { useQuery } from "@tanstack/react-query";
import AuctionCard from "@/components/auction-card";
import AuctionFilters from "@/components/auction-filters";
import { useState } from "react";
import { Auction } from "@shared/schema";
import { Loader2 } from "lucide-react";

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

  return (
    <div>
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