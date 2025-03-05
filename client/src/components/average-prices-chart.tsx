
import React from 'react';
import { formatPrice } from '@/utils/formatters';

interface AveragePriceItem {
  species: string;
  averagePrice: number;
}

interface AveragePricesChartProps {
  averagePrices: AveragePriceItem[];
}

export default function AveragePricesChart({ averagePrices }: AveragePricesChartProps) {
  if (!averagePrices || averagePrices.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No price data available</p>
      </div>
    );
  }

  // Get the maximum price for normalization
  const maxPrice = Math.max(...averagePrices.map(item => item.averagePrice));
  // Use the golden-yellow color from the theme
  const yellowColor = '#FFBA08';

  return (
    <div className="space-y-4">
      {averagePrices.map((item, index) => (
        <div key={index} className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium capitalize">{item.species}</span>
            <span className="text-sm text-muted-foreground">{formatPrice(item.averagePrice)}</span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className="h-full rounded-full"
              style={{ 
                width: `${(item.averagePrice / maxPrice) * 100}%`, 
                backgroundColor: yellowColor,
                position: 'absolute',
                left: 0,
                top: 0
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
