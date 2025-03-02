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
  Legend,
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
  console.log("Price trend data:", {
    dataPoints: data?.length || 0,
    firstPoint: data?.[0],
    lastPoint: data?.[data?.length - 1]
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded p-2 shadow-lg">
          <p className="font-medium">{new Date(label).toLocaleDateString()}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm">
              {entry.name}: {formatPrice(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

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
            <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={mutedColor} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
                type="category"
                scale="time"
              />
              <YAxis
                tickFormatter={(value) => formatPrice(value)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'price') return [`$${(Number(value) / 100).toFixed(2)}`, 'Auction Price'];
                  if (name === 'medianPrice') return [`$${(Number(value) / 100).toFixed(2)}`, 'Market Average'];
                  return [value, name];
                }}
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)'
                }}
                wrapperStyle={{ zIndex: 1000 }}
              />
              <Legend />
              {/* Scatter plot for individual auction prices */}
              <Scatter
                name="Individual Prices"
                dataKey="price"
                fill={primaryColor}
                opacity={0.7}
                shape="circle"
                size={20}
              />
              {/* Trend line showing moving average */}
              <Line
                name="Price Trend"
                type="monotone"
                dataKey="medianPrice"
                stroke={accentColor}
                strokeWidth={2.5}
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