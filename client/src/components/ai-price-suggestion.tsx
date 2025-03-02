import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/utils/formatters";
import { apiRequest } from "@/lib/queryClient";

interface Props {
  species: string;
  category: string;
  onSuggestionsReceived: (suggestions: {
    startPrice: number;
    reservePrice: number;
    description?: string;
  }) => void;
}

export function AIPriceSuggestion({ species, category, onSuggestionsReceived }: Props) {
  const { toast } = useToast();
  const [quality, setQuality] = useState("");
  const [details, setDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getPriceSuggestion = async () => {
    if (!species || !category) {
      toast({
        title: "Missing Information",
        description: "Please select a species and category first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      console.log("[AI PRICE] Requesting price suggestion for:", { species, category, quality, details });

      const response = await apiRequest("POST", "/api/ai/price-suggestion", {
        species,
        category,
        quality: quality || "Standard", // Provide default value
        additionalDetails: details || "" // Make optional
      });

      console.log("[AI PRICE] Received response:", response);

      if (!response || typeof response.startPrice !== 'number' || typeof response.reservePrice !== 'number') {
        throw new Error("Invalid price suggestion format received");
      }

      toast({
        title: "Price Suggestion Generated",
        description: `Recommended prices: Start at ${formatPrice(response.startPrice)}, Reserve at ${formatPrice(response.reservePrice)}`,
      });

      onSuggestionsReceived({
        startPrice: response.startPrice,
        reservePrice: response.reservePrice,
      });
    } catch (error) {
      console.error("[AI PRICE] Error:", error);
      toast({
        title: "AI Feature Coming Soon",
        description: "This feature is not working yet, but will be available soon!",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDescriptionSuggestion = async () => {
    if (!species || !category) {
      toast({
        title: "Missing Information",
        description: "Please select a species and category first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      console.log("[AI DESC] Requesting description for:", { species, category, details });

      const response = await apiRequest("POST", "/api/ai/description-suggestion", {
        title: `${species} - ${category}`,
        species,
        category,
        details: details || "" // Optional but use if provided
      });

      console.log("[AI DESC] Received response:", response);

      if (!response || typeof response.description !== 'string') {
        throw new Error("Invalid description format received");
      }

      toast({
        title: "Description Generated",
        description: "AI-powered description has been generated",
      });

      onSuggestionsReceived({
        startPrice: 0, // Keep existing price
        reservePrice: 0, // Keep existing price
        description: response.description,
      });
    } catch (error) {
      console.error("[AI DESC] Error:", error);
      toast({
        title: "AI Feature Coming Soon",
        description: "This feature is not working yet, but will be available soon!",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Pricing Assistant
        </CardTitle>
        <CardDescription>
          Get AI-powered suggestions for pricing and descriptions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            placeholder="Quality level (e.g., Show Quality, Exhibition Grade)"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
          />
          <Textarea
            placeholder="Additional details about the birds or eggs (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={getPriceSuggestion}
            disabled={isLoading || !species || !category}
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Suggest Price
          </Button>
          <Button
            onClick={getDescriptionSuggestion}
            disabled={isLoading || !species || !category}
            variant="secondary"
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Write Description
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}