
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
