import { useQuery } from "@tanstack/react-query";
import AuctionCard from "@/components/auction-card";
import AuctionFilters from "@/components/auction-filters";
import { useState, useMemo } from "react";
import { Auction, User, Profile } from "@shared/schema";
import { Loader2, Archive, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerShowcase } from "@/components/seller-showcase";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BuyerRequestForm } from "@/components/buyer-request-form";
import { useAuth } from "@/hooks/use-auth";
import { updateAuctionStatus, sendBuyerNotification } from "@/services/auction-service";

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
    enabled: true, // Always enable this query
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

    // Filter out auctions that have ended or have status "completed"
    const active = filtered.filter(auction =>
      new Date(auction.endDate) > now &&
      auction.status !== "completed" &&
      auction.status !== "ended" &&
      auction.status !== "voided"
    );

    // Include auctions that have ended or have status completed
    const completed = filtered.filter(auction =>
      new Date(auction.endDate) <= now ||
      auction.status === "completed" ||
      auction.status === "ended" ||
      auction.status === "voided"
    );

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
      {/* Hero Section - Optimized */}
      <div className="bg-accent h-[300px] md:h-[400px] relative overflow-hidden">
        {/* Pre-loaded background image with reduced processing */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{
            backgroundImage: 'url("/images/hero-chicken.jpg")',
            willChange: 'transform',
          }}
        />
        <div className="container relative h-full mx-auto px-4 flex flex-col justify-center items-center text-center z-10">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Pips 'n Chicks Auctions
          </h1>
          <p className="text-lg md:text-xl text-white max-w-2xl">
            Your trusted marketplace for premium poultry and hatching eggs
          </p>
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
        {!isLoadingSellers && activeSellers && activeSellers.length > 0 && (
          <section className="space-y-6 bg-accent/10 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Featured Sellers</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Meet our trusted and verified poultry sellers
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeSellers
                .filter(seller => {
                  // Check if seller meets all criteria
                  const isApproved = seller.approved === true;
                  const hasProfile = !!seller.profile;
                  const isSellerRole = seller.role === "seller";
                  
                  // Check if seller has at least one active and approved auction
                  const hasActiveAuctions = Array.isArray(seller.auctions) && 
                    seller.auctions.some(auction => 
                      auction.status === "active" && 
                      auction.approved === true
                    );
                  
                  // Log filtering info for debugging
                  console.log(`Filtering seller ${seller.id}:`, {
                    isApproved,
                    hasProfile,
                    isSellerRole,
                    hasActiveAuctions,
                    auctionsCount: Array.isArray(seller.auctions) ? seller.auctions.length : 0
                  });
                  
                  // Only show sellers that meet all criteria
                  return isApproved && hasProfile && isSellerRole && hasActiveAuctions;
                })
                .slice(0, 1) // Only show the first seller 
                .map((seller) => (
                  <SellerShowcase key={seller.id} seller={seller} />
                ))
              }
            </div>
          </section>
        )}

        {/* Archives Section */}
        <section className="space-y-6">
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
                  <AuctionCard key={auction.id} auction={auction} onPayment={() => handlePayment(auction)} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

async function handlePayment(auction: Auction) {
  try {
    // Update auction status to pending payment
    await updateAuctionStatus(auction.id, "pending_payment");

    // Notify buyer
    if (auction.winningBidderId) {
      await sendBuyerNotification(
        auction.winningBidderId,
        `Payment initiated for auction: ${auction.title}`
      );
    }

    // Redirect to payment page
    window.location.href = `/payment/${auction.id}`;
  } catch (error) {
    console.error('Error initiating payment:', error);
  }
}