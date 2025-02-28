import { useQuery } from "@tanstack/react-query";
import AuctionCard from "@/components/auction-card";
import AuctionFilters from "@/components/auction-filters";
import { useState, useMemo } from "react";
import { Auction, User, Profile } from "@shared/schema";
import { Loader2, Archive } from "lucide-react";
import { formatPrice } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { SellerShowcase } from "@/components/seller-showcase";

export default function HomePage() {
  const [filters, setFilters] = useState({
    species: "",
    category: "",
    searchTerm: "",
    sortBy: "default",
  });

  const [showArchives, setShowArchives] = useState(false);

  const { data: auctions, isLoading: isLoadingAuctions } = useQuery<Auction[]>({
    queryKey: [
      "/api/auctions",
      filters.species && `species=${filters.species}`,
      filters.category && `category=${filters.category}`,
    ].filter(Boolean),
  });

  const { data: activeSellers, isLoading: isLoadingSellers } = useQuery<(User & { profile: Profile, auctions: Auction[] })[]>({
    queryKey: ["/api/sellers/active"],
  });

  const { activeAuctions, completedAuctions } = useMemo(() => {
    if (!auctions) return { activeAuctions: [], completedAuctions: [] };

    const now = new Date();
    let filtered = auctions;

    if (filters.searchTerm) {
      const searchTerm = filters.searchTerm.toLowerCase();
      filtered = auctions.filter(auction => 
        auction.title.toLowerCase().includes(searchTerm) || 
        auction.description.toLowerCase().includes(searchTerm)
      );
    }

    const active = filtered.filter(auction => new Date(auction.endDate) > now);
    const completed = filtered.filter(auction => new Date(auction.endDate) <= now);

    if (filters.sortBy && filters.sortBy !== 'default') {
      const sortFn = (a: Auction, b: Auction) => {
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
      };

      active.sort(sortFn);
      completed.sort(sortFn);
    }

    return { activeAuctions: active, completedAuctions: completed };
  }, [auctions, filters.searchTerm, filters.sortBy]);

  return (
    <div>
      <div
        className="bg-cover bg-center h-64 relative"
        style={{
          backgroundImage: 'url("/images/hero-chicken.jpg")',
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
          <h1 className="text-4xl font-bold text-white text-center">
            Pips 'n Chicks Auctions
          </h1>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <AuctionFilters filters={filters} onFilterChange={setFilters} />

        {isLoadingAuctions ? (
          <div className="flex justify-center my-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !activeAuctions?.length && !completedAuctions?.length ? (
          <div className="text-center my-8 text-muted-foreground">
            No auctions found{filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-4">Active Auctions</h2>
              <div className="mt-4 mb-2 text-sm text-muted-foreground">
                Showing {activeAuctions.length} active {activeAuctions.length === 1 ? "auction" : "auctions"}
                {filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
                {activeAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            </div>

            {activeSellers && activeSellers.length > 0 && (
              <div className="mt-16">
                <h2 className="text-2xl font-bold mb-6">Featured Sellers</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeSellers.map((seller) => (
                    <SellerShowcase key={seller.id} seller={seller} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Archives</h2>
                <Button
                  variant="outline"
                  onClick={() => setShowArchives(!showArchives)}
                  className="flex items-center gap-2"
                >
                  <Archive className="h-4 w-4" />
                  {showArchives ? "Hide Archives" : "Show Archives"}
                </Button>
              </div>

              {showArchives && (
                <>
                  <div className="mt-4 mb-2 text-sm text-muted-foreground">
                    Showing {completedAuctions.length} completed {completedAuctions.length === 1 ? "auction" : "auctions"}
                    {filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
                    {completedAuctions.map((auction) => (
                      <AuctionCard key={auction.id} auction={auction} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}