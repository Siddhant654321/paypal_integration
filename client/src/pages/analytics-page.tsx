import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { BuyerRequestList } from "@/components/buyer-request-list";

interface MarketStats {
  activeBuyers: number;
  totalBids: number;
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

        {/* Active Buyers Card */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Active Buyers</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl md:text-4xl font-bold">
              {marketStats?.activeBuyers || 0}
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
      </div>

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
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LineChart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart as RechartsLineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatPrice } from "@/utils/money-utils";
import BuyerRequestList from "@/components/buyer-request-list";

// Theme colors
const THEME_COLORS = {
  deepRed: "#E63946",
  goldenYellow: "#FFBA08",
  vibrantOrange: "#F77F00",
  deepBlue: "#1D3557",
  richTeal: "#43AA8B",
};

interface MarketStats {
  activeBuyers: number;
  totalBids: number;
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

        {/* Active Buyers Card */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Active Buyers</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="text-3xl md:text-4xl font-bold">
              {marketStats?.activeBuyers || 0}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Price History */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Average Price Trends</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={marketStats?.priceHistory || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => formatPrice(value)} />
                <Tooltip
                  formatter={(value) => [formatPrice(value as number), "Average Price"]}
                />
                <Line
                  type="monotone"
                  dataKey="averagePrice"
                  stroke={THEME_COLORS.deepRed}
                  strokeWidth={2}
                  dot={{ fill: THEME_COLORS.deepRed }}
                  activeDot={{ r: 8, fill: THEME_COLORS.vibrantOrange }}
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card>
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Top Performers</CardTitle>
            <CardDescription>This month</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                      Auctions Won: {marketStats.topPerformers.seller.auctionsWon}
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <Bar dataKey="averagePrice" fill={THEME_COLORS.deepBlue}>
                  {(marketStats?.averagePrices || []).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index % 2 === 0 ? THEME_COLORS.richTeal : THEME_COLORS.deepBlue} 
                    />
                  ))}
                </Bar>
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
                <Bar dataKey="count">
                  {(marketStats?.popularCategories || []).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index % 3 === 0 ? THEME_COLORS.goldenYellow : 
                           index % 3 === 1 ? THEME_COLORS.vibrantOrange : 
                           THEME_COLORS.deepRed} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

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
