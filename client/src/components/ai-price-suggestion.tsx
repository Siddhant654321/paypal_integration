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
    try {
      setIsLoading(true);
      const result = await apiRequest("POST", "/api/ai/price-suggestion", {
        species,
        category,
        quality,
        additionalDetails: details,
      });

      // Format the response
      const suggestion = {
        startPrice: result.startPrice,
        reservePrice: result.reservePrice,
      };

      toast({
        title: "Price Suggestion Generated",
        description: `Recommended start price: ${formatPrice(result.startPrice)}`,
      });

      onSuggestionsReceived(suggestion);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get price suggestion",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDescriptionSuggestion = async () => {
    try {
      setIsLoading(true);
      const result = await apiRequest("POST", "/api/ai/description-suggestion", {
        title: `${species} - ${category}`,
        species,
        category,
        details,
      });

      toast({
        title: "Description Generated",
        description: "AI-powered description has been generated",
      });

      onSuggestionsReceived({
        startPrice: 0, // Keep existing price
        reservePrice: 0, // Keep existing price
        description: result.description,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate description",
        variant: "destructive",
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
            placeholder="Additional details about the birds or eggs..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={getPriceSuggestion}
            disabled={isLoading || !quality}
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
            disabled={isLoading || !details}
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
