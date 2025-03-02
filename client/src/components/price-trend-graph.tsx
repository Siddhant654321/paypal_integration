import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
} from "recharts";
import { formatPrice } from "@/utils/formatters";

interface PriceData {
  date: string;
  price: number;
  medianPrice: number;
}

interface Props {
  data: PriceData[];
  species: string[];
  onTimeFrameChange: (timeFrame: string) => void;
  onCategoryChange: (category: string) => void;
  onSpeciesChange: (species: string) => void;
}

export function PriceTrendGraph({ data, species, onTimeFrameChange, onCategoryChange, onSpeciesChange }: Props) {
  // Get theme colors
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8884d8';
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#ccc';
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#82ca9d';

  // Log data for debugging
  console.log("Price trend data:", data);

  return (
    <Card>
      <CardHeader className="space-y-1.5 p-4 md:p-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <CardTitle className="text-lg md:text-xl">Auction Price Trends</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Select onValueChange={onSpeciesChange} defaultValue="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Species</SelectItem>
                {species.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select onValueChange={onCategoryChange} defaultValue="all">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Show Quality">Show Quality</SelectItem>
                <SelectItem value="Purebred & Production">Purebred & Production</SelectItem>
                <SelectItem value="Fun & Mixed">Fun & Mixed</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={onTimeFrameChange} defaultValue="month">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Time Frame" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">Past Month</SelectItem>
                <SelectItem value="year">Past Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0 h-[300px]">
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={mutedColor} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis tickFormatter={(value) => formatPrice(value)} />
              <Tooltip
                formatter={(value) => [formatPrice(value as number), "Price"]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
              />
              {/* Scatter plot for individual auction prices */}
              <Scatter
                name="Auction Price"
                dataKey="price"
                fill={primaryColor}
                opacity={0.6}
              />
              {/* Trend line showing median prices */}
              <Line
                name="Price Trend"
                type="monotone"
                dataKey="medianPrice"
                stroke={accentColor}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No price data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}