import OpenAI from "openai";
import { storage } from "./storage";
import { type Auction } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface PriceSuggestion {
  startPrice: number;
  reservePrice: number;
  confidence: number;
  reasoning: string;
}

interface DescriptionSuggestion {
  title: string;
  description: string;
  suggestedTags: string[];
}

export class AIPricingService {
  static async getPriceSuggestion(
    species: string,
    category: string,
    quality: string,
    additionalDetails: string
  ): Promise<PriceSuggestion> {
    try {
      console.log("[AI PRICING] Getting price suggestion for:", {
        species,
        category,
        quality
      });

      // Get historical auction data
      const pastAuctions = await storage.getAuctions({
        species,
        category,
        status: "ended"
      });

      console.log(`[AI PRICING] Found ${pastAuctions.length} past auctions for analysis`);

      // Format historical data for the prompt
      const auctionStats = this.calculateAuctionStats(pastAuctions);

      const prompt = `As a poultry auction pricing expert, suggest optimal start and reserve prices for:

Species: ${species}
Category: ${category}
Quality: ${quality}
Additional Details: ${additionalDetails}

Historical Market Data:
- Average Selling Price: ${formatPrice(auctionStats.averagePrice)}
- Median Price: ${formatPrice(auctionStats.medianPrice)}
- Price Range: ${formatPrice(auctionStats.minPrice)} - ${formatPrice(auctionStats.maxPrice)}
- Success Rate: ${auctionStats.successRate}%
- Average Days to Sell: ${auctionStats.avgDaysToSell}

Please provide a JSON response with:
- startPrice: recommended starting price in cents
- reservePrice: recommended reserve price in cents
- confidence: confidence score between 0 and 1
- reasoning: detailed explanation for the recommendation`;

      console.log("[AI PRICING] Sending request to OpenAI");
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      if (!response.choices[0].message.content) {
        throw new Error("No response content from OpenAI");
      }

      const suggestion = JSON.parse(response.choices[0].message.content);
      console.log("[AI PRICING] Received suggestion:", suggestion);

      return suggestion;
    } catch (error) {
      console.error("[AI PRICING] Error getting price suggestion:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to generate price suggestion: ${error.message}`);
      }
      throw new Error("Failed to generate price suggestion");
    }
  }

  static async getDescriptionSuggestion(
    title: string,
    species: string,
    category: string,
    details: string
  ): Promise<DescriptionSuggestion> {
    try {
      console.log("[AI PRICING] Getting description suggestion for:", {
        title,
        species,
        category
      });

      const prompt = `As a poultry auction expert, help create an optimized listing for:

Title: ${title}
Species: ${species}
Category: ${category}
Details: ${details}

Please provide a JSON response with:
- title: an optimized, attention-grabbing title
- description: a detailed, well-structured description highlighting key features and value
- suggestedTags: array of relevant keywords for searchability`;

      console.log("[AI PRICING] Sending request to OpenAI");
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      if (!response.choices[0].message.content) {
        throw new Error("No response content from OpenAI");
      }

      const suggestion = JSON.parse(response.choices[0].message.content);
      console.log("[AI PRICING] Received description suggestion");

      return suggestion;
    } catch (error) {
      console.error("[AI PRICING] Error generating description:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to generate description suggestion: ${error.message}`);
      }
      throw new Error("Failed to generate description suggestion");
    }
  }

  private static calculateAuctionStats(auctions: Auction[]) {
    const successfulAuctions = auctions.filter(a => a.status === "ended" && a.winningBidderId);
    const prices = successfulAuctions.map(a => a.currentPrice);

    return {
      averagePrice: prices.length ? 
        prices.reduce((sum, price) => sum + price, 0) / prices.length : 0,
      medianPrice: prices.length ? 
        prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)] : 0,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      successRate: auctions.length ? 
        (successfulAuctions.length / auctions.length) * 100 : 0,
      avgDaysToSell: successfulAuctions.length ?
        successfulAuctions.reduce((sum, auction) => {
          const start = new Date(auction.startDate);
          const end = new Date(auction.endDate);
          return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / successfulAuctions.length : 0
    };
  }
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}