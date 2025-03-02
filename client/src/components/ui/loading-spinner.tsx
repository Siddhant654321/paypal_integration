import React from "react";

interface LoadingSpinnerProps {
  className?: string;
}

export function LoadingSpinner({ className = "h-4 w-4" }: LoadingSpinnerProps) {
  return (
    <img 
      src="/attached_assets/ezgif-473fbbe233db36.gif" 
      alt="Loading..." 
      className={className}
    />
  );
}
