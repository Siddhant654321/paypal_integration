import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
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
  averagePrices: {
    species: string;
    averagePrice: number;
  }[];
  activeAuctions: number;
  recentSales: {
    title: string;
    price: number;
    date: string;
  }[];
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

        {/* Price Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Price Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marketStats?.priceHistory || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis 
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  formatter={(value) => [`$${value}`, "Average Price"]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="averagePrice"
                  stroke="#8884d8"
                  name="Average Price"
                />
              </LineChart>
            </ResponsiveContainer>
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
                <YAxis tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  formatter={(value) => [`$${value}`, "Average Price"]}
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

        {/* Recent Sales */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {marketStats?.recentSales.map((sale, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{sale.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(sale.date).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="font-bold">${sale.price}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
