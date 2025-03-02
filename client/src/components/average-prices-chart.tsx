
import React from 'react';
import { formatPrice } from '@/utils/formatters';

interface AveragePricesChartProps {
  averagePrices: Array<{
    species: string;
    averagePrice: number;
  }>;
}

// Function to get a color based on index
const getColorForIndex = (index: number): string => {
  // Colors from your theme
  const colors = [
    '#43AA8B', // rich-teal
    '#FFBA08', // golden-yellow
    '#F77F00', // vibrant-orange
    '#E63946', // deep-red
    '#1D3557'  // deep-blue
  ];
  
  return colors[index % colors.length];
};

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
      {averagePrices.map((item, index) => (
        <div key={item.species} className="flex flex-col">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium">{item.species}</span>
            <span className="text-sm font-medium">{formatPrice(item.averagePrice)}</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-muted">
            <div 
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ 
                width: `${(item.averagePrice / maxPrice) * 100}%`,
                backgroundColor: '#E63946' // deep-red from theme
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
