
import React from 'react';

interface PopularCategory {
  category: string;
  count: number;
}

interface PopularCategoriesChartProps {
  categories: PopularCategory[];
}

export default function PopularCategoriesChart({ categories }: PopularCategoriesChartProps) {
  if (!categories || categories.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No category data available</p>
      </div>
    );
  }

  // Get the maximum count for normalization
  const maxCount = Math.max(...categories.map(cat => cat.count));
  const tealColor = '#43AA8B'; // rich-teal from theme

  return (
    <div className="space-y-4">
      {categories.map((cat, index) => (
        <div key={index} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{cat.category}</span>
            <span className="text-muted-foreground">{cat.count} listings</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div 
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ 
                width: `${(cat.count / maxCount) * 100}%`,
                backgroundColor: tealColor
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
