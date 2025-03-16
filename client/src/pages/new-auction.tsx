import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAuctionSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/file-upload";
import { AIPriceSuggestion } from "@/components/ai-price-suggestion";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { useState } from 'react';
import { dollarsToCents, formatDollarInput, centsToDollars } from "../utils/formatters";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function NewAuction() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (user.role !== "seller" && user.role !== "seller_admin") {
    return <Redirect to="/" />;
  }

  const form = useForm({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: "",
      description: "",
      species: "",
      category: "Show Quality",
      startPrice: "0.00",
      reservePrice: "0.00",
      startDate: `${new Date().toISOString().split("T")[0]}T00:00`,
      endDate: `${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}T23:59`,
    },
  });

  const createAuctionMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      console.log("[DEBUG] Form data entries:");
      for (const [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
      }

      const res = await fetch("/api/auctions", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("[DEBUG] Server response error:", errorData);
        throw new Error(errorData.message || "Failed to create auction");
      }

      const responseData = await res.json();
      console.log("[DEBUG] Server response:", responseData);
      return responseData;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your auction has been created and is pending approval",
      });
      setLocation("/seller/dashboard");
    },
    onError: (error: Error) => {
      console.error("[DEBUG] Mutation error:", error);
      toast({
        title: "Error creating auction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    try {
      console.log("[DEBUG] Raw form data:", data);

      // Validate required fields
      if (!data.title || !data.species || !data.category) {
        toast({
          title: "Missing Fields",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      const formData = new FormData();

      // Process form data
      const processedData = {
        ...data,
        startPrice: dollarsToCents(parseFloat(data.startPrice)),
        reservePrice: dollarsToCents(parseFloat(data.reservePrice)),
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
      };

      console.log("[DEBUG] Processed data:", processedData);

      // Add all fields to FormData
      Object.entries(processedData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      // Add images
      if (selectedFiles.length > 0) {
        selectedFiles.forEach(file => {
          formData.append('images', file);
        });
        console.log("[DEBUG] Added", selectedFiles.length, "images to form data");
      }

      console.log("[DEBUG] Submitting form...");
      createAuctionMutation.mutate(formData);
    } catch (error) {
      console.error("[DEBUG] Error in form submission:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process form data",
        variant: "destructive",
      });
    }
  });

  const handleSuggestionsReceived = (suggestions: {
    startPrice: number;
    reservePrice: number;
    description?: string;
  }) => {
    if (suggestions.startPrice) {
      form.setValue('startPrice', centsToDollars(suggestions.startPrice).toFixed(2));
    }
    if (suggestions.reservePrice) {
      form.setValue('reservePrice', centsToDollars(suggestions.reservePrice).toFixed(2));
    }
    if (suggestions.description) {
      form.setValue('description', suggestions.description);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Create New Auction</h1>

      <Form {...form}>
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          encType="multipart/form-data"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter auction title" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="species"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Species</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select species" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="waterfowl">Waterfowl</SelectItem>
                      <SelectItem value="bantam">Bantam</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="quail">Quail</SelectItem>
                      <SelectItem value="other">All Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Show Quality">Show Quality</SelectItem>
                      <SelectItem value="Purebred & Production">Purebred & Production</SelectItem>
                      <SelectItem value="Fun & Mixed">Fun & Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <AIPriceSuggestion
            species={form.watch("species")}
            category={form.watch("category")}
            onSuggestionsReceived={handleSuggestionsReceived}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Provide detailed description of your auction item"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="mb-4">
            <FormLabel>Images</FormLabel>
            <FileUpload
              multiple
              onFilesChange={setSelectedFiles}
              accept="image/*"
              maxFiles={5}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starting Price ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => {
                        const formatted = formatDollarInput(e.target.value);
                        field.onChange(formatted);
                      }}
                      onBlur={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        field.onChange(value.toFixed(2));
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    The starting bid amount in dollars
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reservePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reserve Price ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => {
                        const formatted = formatDollarInput(e.target.value);
                        field.onChange(formatted);
                      }}
                      onBlur={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        field.onChange(value.toFixed(2));
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    The minimum price you're willing to accept
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date and Time</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        min={new Date().toISOString().split("T")[0] + "T00:00"}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date and Time</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        min={form.watch("startDate")}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={createAuctionMutation.isPending}
          >
            {createAuctionMutation.isPending && (
              <LoadingSpinner className="mr-2 h-4 w-4" />
            )}
            Create Auction
          </Button>
        </form>
      </Form>
    </div>
  );
}