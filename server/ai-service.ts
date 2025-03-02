import OpenAI from "openai";
import { storage } from "./storage";
import { type Auction } from "@shared/schema";

// Initialize xAI client with Grok model
const xai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
});

interface PriceSuggestion {
  startPrice: number;
  reservePrice: number;
  confidence: number;
  reasoning: string;
}

interface DescriptionSuggestion {
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
        quality,
        additionalDetails: additionalDetails.substring(0, 100) + "..."
      });

      // Check if we have an API key
      if (!process.env.XAI_API_KEY) {
        throw new Error("xAI API key is not configured");
      }

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
Quality Level: ${quality}
Details: ${additionalDetails}

Historical Market Data:
- Average Price: ${formatPrice(auctionStats.averagePrice)}
- Median Price: ${formatPrice(auctionStats.medianPrice)}
- Price Range: ${formatPrice(auctionStats.minPrice)} - ${formatPrice(auctionStats.maxPrice)}
- Success Rate: ${Math.round(auctionStats.successRate)}%

Based on this information, provide a pricing strategy in JSON format with:
{
  "startPrice": <recommended starting price in cents>,
  "reservePrice": <recommended reserve price in cents>,
  "confidence": <confidence score between 0 and 1>,
  "reasoning": "<detailed explanation for the recommendation>"
}`;

      console.log("[AI PRICING] Sending request to xAI");

      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      if (!response.choices[0].message.content) {
        throw new Error("No response content from xAI");
      }

      const suggestion = JSON.parse(response.choices[0].message.content) as PriceSuggestion;

      // Validate suggestion format
      if (!suggestion.startPrice || !suggestion.reservePrice) {
        throw new Error("Invalid price suggestion format from AI");
      }

      console.log("[AI PRICING] Generated suggestion:", {
        startPrice: formatPrice(suggestion.startPrice),
        reservePrice: formatPrice(suggestion.reservePrice),
        confidence: suggestion.confidence
      });

      return suggestion;
    } catch (error) {
      console.error("[AI PRICING] Error getting price suggestion:", error);
      if (error instanceof Error && error.message.includes("API key")) {
        throw new Error("xAI API key configuration error. Please check the API key.");
      }
      throw new Error(error instanceof Error ? error.message : "Failed to generate price suggestion");
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
        category,
        details: details.substring(0, 100) + "..."
      });

      // Check if we have an API key
      if (!process.env.XAI_API_KEY) {
        throw new Error("xAI API key is not configured");
      }

      const prompt = `As a poultry auction expert, create an optimized listing description for:

Title: ${title}
Species: ${species}
Category: ${category}
Details: ${details}

Provide a response in JSON format with:
{
  "description": "<a detailed, well-structured description highlighting key features and value>",
  "suggestedTags": ["<array of relevant keywords for searchability>"]
}

Important guidelines:
- Be specific about breed characteristics and quality indicators
- Highlight unique selling points
- Include relevant care and breeding information
- Use professional terminology appropriate for the category
- Keep the description concise but comprehensive`;

      console.log("[AI PRICING] Sending request to xAI");
      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      if (!response.choices[0].message.content) {
        throw new Error("No response content from xAI");
      }

      const suggestion = JSON.parse(response.choices[0].message.content) as DescriptionSuggestion;

      // Validate suggestion format
      if (!suggestion.description || !Array.isArray(suggestion.suggestedTags)) {
        throw new Error("Invalid description suggestion format from AI");
      }

      console.log("[AI PRICING] Generated description suggestion");

      return suggestion;
    } catch (error) {
      console.error("[AI PRICING] Error generating description:", error);
      if (error instanceof Error && error.message.includes("API key")) {
        throw new Error("xAI API key configuration error. Please check the API key.");
      }
      throw new Error(error instanceof Error ? error.message : "Failed to generate description");
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
        (successfulAuctions.length / auctions.length) * 100 : 0
    };
  }
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}