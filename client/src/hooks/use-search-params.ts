import { useLocation } from "wouter";

/**
 * Custom hook to work with URL search parameters
 * @returns URLSearchParams object for the current URL
 */
export function useSearchParams(): URLSearchParams {
  const [location] = useLocation();
  return new URLSearchParams(location.split("?")[1] || "");
}