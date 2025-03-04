
import React from "react";

interface LoadingSpinnerProps {
  className?: string;
}

export function LoadingSpinner({ className = "h-4 w-4" }: LoadingSpinnerProps) {
  return (
    <img 
      src="/images/spinner.gif" 
      alt="Loading..." 
      className={className}
      onError={(e) => {
        console.log("Loading spinner image failed to load, trying fallback path");
        e.currentTarget.src = "/attached_assets/ezgif-473fbbe233db36.gif";
      }}
    />
  );
}
