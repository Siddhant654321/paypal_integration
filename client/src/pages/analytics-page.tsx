import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trophy } from "lucide-react";
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
import { formatPrice } from "@/utils/formatters";

interface MarketStats {
  averagePrices: {
    species: string;
    averagePrice: number;
  }[];
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
  priceHistory: {
    date: string;
    averagePrice: number;
  }[];
  popularCategories: {
    category: string;
    count: number;
  }[];
}

export default function AnalyticsPage() {
  const { data: marketStats, isLoading } = useQuery<MarketStats>({
    queryKey: ["/api/analytics/market-stats"],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Market Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Auctions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Active Auctions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {marketStats?.activeAuctions || 0}
            </div>
          </CardContent>
        </Card>

        {/* Top Performers Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top Performers (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Top Seller */}
              <div className="space-y-2">
                <h3 className="font-semibold">Top Seller</h3>
                {marketStats?.topPerformers.seller ? (
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="font-medium">{marketStats.topPerformers.seller.name}</div>
                    <div className="text-sm text-muted-foreground">
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
              <div className="space-y-2">
                <h3 className="font-semibold">Top Buyer</h3>
                {marketStats?.topPerformers.buyer ? (
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="font-medium">{marketStats.topPerformers.buyer.name}</div>
                    <div className="text-sm text-muted-foreground">
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

        {/* Average Prices by Species */}
        <Card>
          <CardHeader>
            <CardTitle>Average Prices by Species</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
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
        <Card>
          <CardHeader>
            <CardTitle>Popular Categories</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
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
      </div>
    </div>
  );
}