import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Users, Trophy } from "lucide-react";
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
  Legend,
} from "recharts";
import { formatPrice } from "@/utils/formatters";
import { BuyerRequestList } from "@/components/buyer-request-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useTheme } from "@/hooks/use-theme";

interface MarketStats {
  activeBidders: number;
  totalBids: number;
  averagePrices: {
    species: string;
    averagePrice: number;
  }[];
  activeAuctions: number;
  priceHistory: {
    category: string;
    date: string;
    averagePrice: number;
  }[];
  popularCategories: {
    category: string;
    count: number;
  }[];
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
}

export default function AnalyticsPage() {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { data: marketStats, isLoading } = useQuery<MarketStats>({
    queryKey: ["/api/analytics/market-stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Filter price history based on selected category
  const filteredPriceHistory = marketStats?.priceHistory.filter(
    item => selectedCategory === "all" || item.category === selectedCategory
  );

  // Get unique categories for the select dropdown
  const categories = Array.from(
    new Set(marketStats?.priceHistory.map(item => item.category) || [])
  );

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold">Market Analytics</h1>

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
            <CardTitle className="text-lg md:text-xl flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Bidders
            </CardTitle>
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
      </div>

      {/* Price History Chart */}
      <Card className="col-span-full">
        <CardHeader className="space-y-1.5 p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl">Average Price History</CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredPriceHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short' })}
              />
              <YAxis tickFormatter={(value) => formatPrice(value)} />
              <Tooltip
                formatter={(value) => [formatPrice(value as number), "Average Price"]}
                labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
              />
              {selectedCategory === "all" ? (
                <>
                  {categories.map((category, index) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey="averagePrice"
                      data={marketStats?.priceHistory.filter(item => item.category === category)}
                      name={category}
                      stroke={`hsl(${theme.primary})`}
                      strokeOpacity={0.7 - (index * 0.2)}
                    />
                  ))}
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey="averagePrice"
                  stroke={`hsl(${theme.primary})`}
                  name={selectedCategory}
                />
              )}
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Average Prices by Species */}
      <Card className="col-span-full sm:col-span-1">
        <CardHeader className="space-y-1.5 p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl">Average Prices by Species</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={marketStats?.averagePrices || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="species" />
              <YAxis tickFormatter={(value) => formatPrice(value)} />
              <Tooltip
                formatter={(value) => [formatPrice(value as number), "Average Price"]}
              />
              <Bar dataKey="averagePrice" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

        {/* Popular Categories */}
        <Card className="col-span-full sm:col-span-1">
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Popular Categories</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marketStats?.popularCategories || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
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