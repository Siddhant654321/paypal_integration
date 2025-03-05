
import React from 'react';

interface PopularCategoryItem {
  category: string;
  count: number;
}

interface PopularCategoriesChartProps {
  popularCategories: PopularCategoryItem[];
}

export default function PopularCategoriesChart({ popularCategories }: PopularCategoriesChartProps) {
  if (!popularCategories || popularCategories.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No category data available</p>
      </div>
    );
  }

  // Get the maximum count for normalization
  const maxCount = Math.max(...popularCategories.map(cat => cat.count));
  // Use the rich-teal color from the theme
  const tealColor = '#43AA8B';

  return (
    <div className="space-y-4">
      {popularCategories.map((cat, index) => (
        <div key={index} className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium">{cat.category}</span>
            <span className="text-sm text-muted-foreground">{cat.count} listings</span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className="h-full rounded-full"
              style={{ 
                width: `${(cat.count / maxCount) * 100}%`, 
                backgroundColor: tealColor,
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
