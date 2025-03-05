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
    seller: any;
    buyer: any;
  };
}

export const getMarketStats = async (timeFrame?: string, category?: string, species?: string): Promise<MarketStats> => {
  const params = new URLSearchParams();
  if (timeFrame) params.append("timeFrame", timeFrame);
  if (category) params.append("category", category);
  if (species) params.append("species", species);

  const queryString = params.toString();
  const url = `/api/analytics/market-stats${queryString ? `?${queryString}` : ''}`;
  
  console.log("Fetching market stats from:", url);
  
  const response = await api.get(url);
  return response.data;
};