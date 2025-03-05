import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Loader2, Users, Trophy } from "lucide-react";
import { PriceTrendGraph } from "@/components/price-trend-graph";
import { formatPrice } from "@/utils/formatters";
import { BuyerRequestList } from "@/components/buyer-request-list";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface MarketStats {
  activeBidders: number;
  totalBids: number;
  averagePrices: {
    species: string;
    averagePrice: number;
  }[];
  priceData: {
    date: string;
    price: number;
    medianPrice: number;
  }[];
  species: string[];
  activeAuctions: number;
  topPerformers: {
    seller: {
      name: string;
      total: number;
      auctionsWon: number;
    } | null;
    buyer: {
      name: string;
      total: number;
      auctionsWon: number;
    } | null;
  };
  popularCategories: {
    category: string;
    count: number;
  }[];
}

export default function AnalyticsPage() {
  const [timeFrame, setTimeFrame] = useState("month");
  const [category, setCategory] = useState("all");
  const [selectedSpecies, setSelectedSpecies] = useState("all");

  const { data: marketStats, isLoading } = useQuery<MarketStats>({
    queryKey: ["/api/analytics/market-stats", timeFrame, category, selectedSpecies],
  });

  // Get theme colors from CSS variables.  These should be defined in your CSS.
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8884d8';
  const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim() || '#82ca9d';
  const tertiaryColor = getComputedStyle(document.documentElement).getPropertyValue('--tertiary').trim() || '#6c757d';
  const tealColor = '#008080';
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#ccc';


  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Check if we have valid market stats data
  const hasData = marketStats && 
    (marketStats.priceData?.length > 0 || 
     marketStats.popularCategories?.length > 0);

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold">Market Analytics</h1>

      {hasData ? (
        <>
          {/* Price Trend Graph with updated data format and teal dots */}
          <PriceTrendGraph
            data={marketStats?.priceData || []}
            species={marketStats?.species || []}
            dotColor={tealColor}
            onTimeFrameChange={setTimeFrame}
            onCategoryChange={setCategory}
            onSpeciesChange={setSelectedSpecies}
          />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {/* Active Auctions Card */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Active Auctions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl md:text-4xl font-bold">
              {marketStats?.activeAuctions || 0}
            </div>
          </CardContent>
        </Card>

        {/* Active Bidders Card */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Active Bidders</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl md:text-4xl font-bold">
              {marketStats?.activeBidders || 0}
            </div>
          </CardContent>
        </Card>

        {/* Total Bids Card */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Total Bids</CardTitle>
            <CardDescription>All time</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl md:text-4xl font-bold">
              {marketStats?.totalBids || 0}
            </div>
          </CardContent>
        </Card>

        {/* Top Performers Card */}
        <Card className="col-span-full">
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top Performers (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Top Seller */}
              <div className="space-y-3">
                <h3 className="font-semibold">Top Seller</h3>
                {marketStats?.topPerformers.seller ? (
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="font-medium">{marketStats.topPerformers.seller.name}</div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Total Sales: {formatPrice(marketStats.topPerformers.seller.total)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Auctions Completed: {marketStats.topPerformers.seller.auctionsWon}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No sales data available</div>
                )}
              </div>

              {/* Top Buyer */}
              <div className="space-y-3">
                <h3 className="font-semibold">Top Buyer</h3>
                {marketStats?.topPerformers.buyer ? (
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="font-medium">{marketStats.topPerformers.buyer.name}</div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Total Spent: {formatPrice(marketStats.topPerformers.buyer.total)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Auctions Won: {marketStats.topPerformers.buyer.auctionsWon}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No purchase data available</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Prices by Species with color updates */}
        <Card className="col-span-full sm:col-span-1">
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Average Prices by Species</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marketStats?.averagePrices || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={mutedColor} />
                <XAxis dataKey="species" />
                <YAxis tickFormatter={(value) => formatPrice(value)} />
                <Tooltip
                  formatter={(value) => [formatPrice(value as number), "Average Price"]}
                  contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                />
                <Bar dataKey="averagePrice" fill={tertiaryColor} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Popular Categories with color updates */}
        <Card className="col-span-full sm:col-span-1">
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Popular Categories</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marketStats?.popularCategories || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={mutedColor} />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                />
                <Bar dataKey="count" fill={secondaryColor} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
        </>
      ) : (
        <div className="py-8 text-center">
          <div className="mx-auto max-w-md p-6 bg-muted rounded-lg">
            <h3 className="text-xl font-semibold mb-2">No Market Data Available</h3>
            <p className="text-muted-foreground">
              There isn't enough auction data to display analytics yet. As more auctions complete, statistics will be shown here.
            </p>
          </div>
        </div>
      )}

      {/* Market Demand Section */}
      <div className="mt-8 space-y-4">
        <h2 className="text-xl md:text-2xl font-bold">Market Demand</h2>
        <p className="text-sm md:text-base text-muted-foreground">
          Current buyer requests and market demand for specific breeds and varieties
        </p>
        <div className="mt-6">
          <BuyerRequestList />
        </div>
      </div>
    </div>
  );
}