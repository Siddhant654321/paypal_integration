import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/utils/money-utils";

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

// Theme colors from the new color scheme
const THEME_COLORS = {
  primary: "#E63946", // Deep Red
  secondary: "#FFBA08", // Golden Yellow
  tertiary: "#F77F00", // Vibrant Orange
  heading: "#1D3557", // Deep Blue
  text: "#43AA8B", // Rich Teal
  accent: "#FFBA08", // Golden Yellow for highlights
};

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
        {/* Price History Chart */}
        <Card className="col-span-full md:col-span-1">
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">Price Trends</CardTitle>
            <CardDescription>Average price over time</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marketStats?.priceHistory || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  formatter={(value) => [`$${value}`, "Average Price"]}
                />
                <Line
                  type="monotone"
                  dataKey="averagePrice"
                  stroke={THEME_COLORS.primary}
                  strokeWidth={2}
                  dot={{ fill: THEME_COLORS.primary, r: 4 }}
                  activeDot={{ r: 8, fill: THEME_COLORS.tertiary }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Average Price by Species */}
        <Card className="col-span-full md:col-span-1">
          <CardHeader className="space-y-1.5 p-4 md:p-6">
            <CardTitle className="text-lg md:text-xl">
              Average Price by Species
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={marketStats?.averagePrices || []}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ species, averagePrice }) => 
                    `${species}: ${formatCurrency(averagePrice)}`
                  }
                  labelLine={false}
                  dataKey="averagePrice"
                  nameKey="species"
                >
                  {marketStats?.averagePrices.map((entry, index) => {
                    const colors = [
                      THEME_COLORS.primary,
                      THEME_COLORS.secondary,
                      THEME_COLORS.tertiary,
                      THEME_COLORS.heading,
                      THEME_COLORS.text,
                    ];
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={colors[index % colors.length]}
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatCurrency(value as number), "Average Price"]}
                />
              </PieChart>
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
                <Bar dataKey="count" fill={THEME_COLORS.text} radius={[4, 4, 0, 0]}>
                  {marketStats?.popularCategories.map((entry, index) => {
                    const colors = [
                      THEME_COLORS.text,
                      THEME_COLORS.secondary,
                      THEME_COLORS.tertiary,
                      THEME_COLORS.primary
                    ];
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={colors[index % colors.length]}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}