import { useMutation, useQuery } from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "./api-client";

export interface MarketStats {
  activeBidders: number;
  totalBids: number;
  activeAuctions: number;
  priceData: {
    date: string;
    price: number;
    title: string;
  }[];
  species: string[];
  averagePrices: {
    species: string;
    averagePrice: number;
  }[];
  popularCategories: {
    category: string;
    count: number;
  }[];
  topPerformers: {
    seller: {
      userId: number;
      name: string;
      total: number;
      auctionsWon: number;
    } | null;
    buyer: {
      userId: number;
      name: string;
      total: number;
      bidsPlaced?: number;
      auctionsWon?: number;
    } | null;
  };
}

export function useMarketStats(timeFrame = "month", category = "all", species = "all") {
  return useQuery<MarketStats>({
    queryKey: ["market-stats", timeFrame, category, species],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeFrame,
        category,
        species,
      });
      console.log("[QUERY] Fetching /api/analytics/market-stats");
      const response = await fetchWithAuth(`${API_URL}/analytics/market-stats?${params}`);
      console.log("[QUERY] Response for /api/analytics/market-stats:", {
        status: response.status,
        ok: response.ok
      });

      const data = await response.json();
      console.log("[QUERY] Market stats data received:", {
        priceDataPoints: data.priceData?.length || 0,
        categories: data.popularCategories?.length || 0,
        activeAuctions: data.activeAuctions || 0
      });
      return data;
    },
  });
}


import { api } from "./api";

export interface PriceDataPoint {
  date: string;
  price: number;
  title: string;
  medianPrice?: number;
}

export interface CategoryDataPoint {
  category: string;
  count: number;
}

export interface TopPerformer {
  userId: number;
  name: string;
  total: number;
  auctionsWon: number;
}

export interface MarketStats {
  activeBidders: number;
  totalBids: number;
  activeAuctions: number;
  priceData: PriceDataPoint[];
  species: string[];
  averagePrices: Array<{
    species: string;
    averagePrice: number;
  }>;
  popularCategories: CategoryDataPoint[];
  topPerformers: {
    seller: TopPerformer | null;
    buyer: TopPerformer | null;
  };
}

export const getMarketStats = async (timeFrame?: string, category?: string, species?: string): Promise<MarketStats> => {
  try {
    const params = new URLSearchParams();
    if (timeFrame) params.append("timeFrame", timeFrame);
    if (category) params.append("category", category);
    if (species) params.append("species", species);

    const queryString = params.toString();
    const url = `/api/analytics/market-stats${queryString ? `?${queryString}` : ''}`;

    console.log("Fetching market stats from:", url);

    const response = await api.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching market stats:", error);
    // Return empty default data structure to avoid UI errors
    return {
      activeBidders: 0,
      totalBids: 0,
      activeAuctions: 0,
      priceData: [],
      species: [],
      averagePrices: [],
      popularCategories: [],
      topPerformers: {
        seller: null,
        buyer: null
      }
    };
  }
};