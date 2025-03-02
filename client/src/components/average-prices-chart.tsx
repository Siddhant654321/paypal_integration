import React from 'react';
import { formatPrice } from '@/utils/formatters';

interface AveragePricesChartProps {
  averagePrices: Array<{
    species: string;
    averagePrice: number;
  }>;
}

export function AveragePricesChart({ averagePrices }: AveragePricesChartProps) {
  if (!averagePrices || averagePrices.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No average price data available</p>
      </div>
    );
  }

  // Get the maximum price for normalization
  const maxPrice = Math.max(...averagePrices.map(item => item.averagePrice));

  return (
    <div className="space-y-4">
      {averagePrices.map((item) => (
        <div key={item.species} className="flex items-center">
          <div className="mr-2 w-32 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
            {item.species}
          </div>
          <div className="relative h-2 flex-1 rounded-full bg-muted">
            <div 
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ 
                width: `${(item.averagePrice / maxPrice) * 100}%`,
                backgroundColor: '#FFBA08' // golden-yellow from theme
              }}
            />
          </div>
          <span className="ml-2 text-sm font-medium">{formatPrice(item.averagePrice)}</span>
        </div>
      ))}
    </div>
  );
}