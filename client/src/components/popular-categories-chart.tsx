import React from 'react';

// Function to get a color based on index
const getColorForIndex = (index: number): string => {
  // Colors from your theme
  const colors = [
    '#FFBA08', // golden-yellow
    '#F77F00', // vibrant-orange
    '#43AA8B', // rich-teal
    '#E63946', // deep-red
    '#1D3557'  // deep-blue
  ];
  
  return colors[index % colors.length];
};

interface PopularCategoriesChartProps {
  categories: Array<{
    category: string;
    count: number;
  }>;
}

export function PopularCategoriesChart({ categories }: PopularCategoriesChartProps) {
  if (!categories || categories.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-muted-foreground">No category data available</p>
      </div>
    );
  }

  // Get the maximum count for normalization
  const maxCount = Math.max(...categories.map(cat => cat.count));

  return (
    <div className="space-y-4">
      {categories.slice(0, 5).map((cat) => (
        <div key={cat.category} className="flex items-center">
          <div className="mr-2 w-32 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
            {cat.category}
          </div>
          <div className="relative h-2 flex-1 rounded-full bg-muted">
            <div 
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ 
                width: `${(cat.count / maxCount) * 100}%`,
                backgroundColor: getColorForIndex(index) 
              }}
            />
          </div>
          <span className="ml-2 text-sm font-medium">{cat.count}</span>
        </div>
      ))}
    </div>
  );
}