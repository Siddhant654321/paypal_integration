import { useQuery } from "@tanstack/react-query";
import AuctionCard from "@/components/auction-card";
import AuctionFilters from "@/components/auction-filters";
import { useState, useMemo } from "react";
import { Auction } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { formatToUSD } from "@/utils/formatters";

export default function HomePage() {
  const [filters, setFilters] = useState({
    species: "",
    category: "",
    searchTerm: "",
    sortBy: "",
  });

  const { data: auctions, isLoading } = useQuery<Auction[]>({
    queryKey: [
      "/api/auctions",
      filters.species && `species=${filters.species}`,
      filters.category && `category=${filters.category}`,
    ].filter(Boolean),
  });

  // Function to sort and filter auctions based on user selection
  const displayedAuctions = useMemo(() => {
    if (!auctions) return [];
    
    // First filter by search term if provided
    let filtered = auctions;
    if (filters.searchTerm) {
      const searchTerm = filters.searchTerm.toLowerCase();
      filtered = auctions.filter(auction => 
        auction.title.toLowerCase().includes(searchTerm) || 
        auction.description.toLowerCase().includes(searchTerm)
      );
    }
    
    // Then sort based on the selected sort option
    if (filters.sortBy && filters.sortBy !== 'default') {
      return [...filtered].sort((a, b) => {
        switch (filters.sortBy) {
          case 'endingSoon':
            return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          case 'priceAsc':
            return a.currentPrice - b.currentPrice;
          case 'priceDesc':
            return b.currentPrice - a.currentPrice;
          case 'newest':
            return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
          default:
            return 0;
        }
      });
    }
    
    return filtered;
  }, [auctions, filters.searchTerm, filters.sortBy]);

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
        ) : !displayedAuctions?.length ? (
          <div className="text-center my-8 text-muted-foreground">
            No auctions found{filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
          </div>
        ) : (
          <>
            <div className="mt-4 mb-2 text-sm text-muted-foreground">
              Showing {displayedAuctions.length} {displayedAuctions.length === 1 ? "auction" : "auctions"}
              {filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
              {displayedAuctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}