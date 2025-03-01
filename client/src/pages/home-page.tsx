import { useQuery } from "@tanstack/react-query";
import AuctionCard from "@/components/auction-card";
import AuctionFilters from "@/components/auction-filters";
import { useState, useMemo } from "react";
import { Auction, User, Profile } from "@shared/schema";
import { Loader2, Archive, Search } from "lucide-react";
import { formatPrice } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { SellerShowcase } from "@/components/seller-showcase";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BuyerRequestForm } from "@/components/buyer-request-form";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { user } = useAuth();
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
    <div className="min-h-screen">
      {/* Hero Section */}
      <div
        className="relative h-[300px] md:h-[400px] bg-cover bg-center"
        style={{
          backgroundImage: 'url("/images/hero-chicken.jpg")',
        }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]">
          <div className="container h-full mx-auto px-4 flex flex-col justify-center items-center text-center">
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Pips 'n Chicks Auctions
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl">
              Your trusted marketplace for premium poultry and hatching eggs
            </p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Filters Section */}
        <div className="bg-card rounded-lg shadow-sm p-4">
          <AuctionFilters filters={filters} onFilterChange={setFilters} />
        </div>

        {/* Active Auctions Section */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold">Active Auctions</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Showing {activeAuctions.length} active {activeAuctions.length === 1 ? "auction" : "auctions"}
                {filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
              </p>
            </div>

            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" className="whitespace-nowrap">
                  <Search className="h-4 w-4 mr-2" />
                  Create Buyer Request
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Create a Buyer Request</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <BuyerRequestForm />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {isLoadingAuctions ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !activeAuctions.length ? (
            <div className="text-center py-12 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground">
                No auctions found{filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeAuctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          )}
        </section>

        {/* Featured Sellers Section */}
        {activeSellers && activeSellers.length > 0 && (
          <section className="pt-8 space-y-6">
            <h2 className="text-2xl font-bold">Featured Sellers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeSellers.map((seller) => (
                <SellerShowcase key={seller.id} seller={seller} />
              ))}
            </div>
          </section>
        )}

        {/* Archives Section */}
        <section className="pt-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-2xl font-bold">Archives</h2>
            <Button
              variant="outline"
              onClick={() => setShowArchives(!showArchives)}
              className="whitespace-nowrap"
            >
              <Archive className="h-4 w-4 mr-2" />
              {showArchives ? "Hide Archives" : "Show Archives"}
            </Button>
          </div>

          {showArchives && (
            <>
              <p className="text-sm text-muted-foreground">
                Showing {completedAuctions.length} completed {completedAuctions.length === 1 ? "auction" : "auctions"}
                {filters.searchTerm ? ` matching "${filters.searchTerm}"` : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}