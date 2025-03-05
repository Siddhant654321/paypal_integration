import { useState, useEffect } from "react";
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
  Label
} from "recharts";
import { formatPrice } from "@/utils/formatters";

interface PriceData {
  date: string;
  price: number;
  medianPrice?: number;
  title?: string;
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
  const tealColor = '#43AA8B'; // Added teal color

  // Format data for display
  const [formattedData, setFormattedData] = useState(data);

  useEffect(() => {
    if (data && data.length > 0) {
      // Sort data by date to ensure proper timeline
      const sortedData = [...data].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Format dates for better display
      const formatted = sortedData.map(item => ({
        ...item,
        // Keep original date for X-axis but add formatted date for display
        formattedDate: new Date(item.date).toLocaleDateString()
      }));

      setFormattedData(formatted);

      console.log("Price trend data (formatted):", {
        dataPoints: formatted.length,
        firstPoint: formatted[0],
        lastPoint: formatted[formatted.length - 1]
      });
    } else {
      setFormattedData([]);
    }
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Find the complete data point to get additional info like auction title
      const dataPoint = formattedData.find(item => item.date === label);

      return (
        <div className="bg-background border rounded p-2 shadow-lg">
          <p className="font-medium">{new Date(label).toLocaleDateString()}</p>
          {dataPoint?.title && (
            <p className="text-sm font-medium text-primary">{dataPoint.title}</p>
          )}
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm">
              {entry.name === "price" ? "Auction Price" : "Market Average"}: {formatPrice(entry.value)}
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
        {formattedData && formattedData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart 
              data={formattedData} 
              margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={mutedColor} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }}
                type="category"
                angle={-30}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
              >
                <Label
                  value="Auction Date"
                  position="insideBottom"
                  offset={-10}
                  style={{ textAnchor: 'middle', fontSize: '12px' }}
                />
              </XAxis>
              <YAxis
                tickFormatter={(value) => formatPrice(value)}
                domain={['auto', 'auto']}
              >
                <Label
                  value="Price"
                  position="insideLeft"
                  angle={-90}
                  style={{ textAnchor: 'middle', fontSize: '12px' }}
                />
              </YAxis>
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} />
              {/* Scatter plot for individual auction prices */}
              <Scatter
                name="Auction Price"
                dataKey="price"
                fill={tealColor} // Changed to teal
                opacity={0.8}
                shape="circle"
                size={60}
              />
              {/* Trend line showing moving average */}
              <Line
                name="Market Average"
                type="monotone"
                dataKey="medianPrice"
                stroke={accentColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p>No price data available yet. More data will be shown as auctions complete.</p>
            <p className="text-sm mt-2">Try selecting a different time frame or category</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}