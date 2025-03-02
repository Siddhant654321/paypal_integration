
import React from "react";
import { cn } from "@/lib/utils";

export interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
}

export function Heading1({ children, className, ...props }: TypographyProps) {
  return (
    <h1 
      className={cn("text-3xl font-bold text-heading mb-4", className)} 
      {...props}
    >
      {children}
    </h1>
  );
}

export function Heading2({ children, className, ...props }: TypographyProps) {
  return (
    <h2 
      className={cn("text-2xl font-bold text-heading mb-3", className)} 
      {...props}
    >
      {children}
    </h2>
  );
}

export function Heading3({ children, className, ...props }: TypographyProps) {
  return (
    <h3 
      className={cn("text-xl font-bold text-heading mb-2", className)} 
      {...props}
    >
      {children}
    </h3>
  );
}

export function BodyText({ children, className, ...props }: TypographyProps) {
  return (
    <p 
      className={cn("text-body mb-2", className)} 
      {...props}
    >
      {children}
    </p>
  );
}

export function SmallText({ children, className, ...props }: TypographyProps) {
  return (
    <p 
      className={cn("text-sm text-body", className)} 
      {...props}
    >
      {children}
    </p>
  );
}
