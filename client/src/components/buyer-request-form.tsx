import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { InsertBuyerRequest, insertBuyerRequestSchema } from "@shared/schema";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const SPECIES_OPTIONS = ["bantam", "standard", "waterfowl", "quail", "other"];

const CATEGORY_OPTIONS = [
  "Show Quality",
  "Purebred & Production",
  "Fun & Mixed",
];

export function BuyerRequestForm() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertBuyerRequest>({
    resolver: zodResolver(insertBuyerRequestSchema),
    defaultValues: {
      title: "",
      species: "",
      category: "",
      description: "",
    },
  });

  const createRequest = useMutation({
    mutationFn: async (data: InsertBuyerRequest) => {
      console.log("Submitting buyer request with data:", data);
      try {
        const response = await fetch("/api/buyer-requests", {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(data)
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Failed to create request" }));
          console.error("Server error response:", errorData);
          throw new Error(errorData.message || "Failed to create request");
        }
        
        const result = await response.json();
        console.log("Buyer request creation response:", result);
        return result;
      } catch (error) {
        console.error("Error creating buyer request:", error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log("Successfully created buyer request");
      queryClient.invalidateQueries({ queryKey: ["/api/buyer-requests"] });
      toast({
        title: "Request Created",
        description: "Your request has been created successfully.",
      });
      form.reset();
      navigate("/buyer-requests");
    },
    onError: (error: any) => {
      console.error("Mutation error:", error);

      if (error.message === "Unauthorized") {
        toast({
          title: "Authentication Required",
          description: "Please sign in or create an account to submit a request.",
          variant: "destructive",
        });
        navigate("/auth");
      } else {
        // Show more detailed error if available
        const errorMessage = error.message || "Failed to create request";
        toast({
          title: "Error Creating Request",
          description: errorMessage + ". Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  function onSubmit(data: InsertBuyerRequest) {
    console.log("Form submitted with values:", data);

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in or create an account to submit a request.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    // Make sure species is using the correct format
    if (data.species) {
      data.species = data.species.toLowerCase();
    }

    // Add proper validation for required fields
    if (!data.title || !data.species || !data.category || !data.description) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    createRequest.mutate(data);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="E.g., Looking for Show Quality Bantam Chickens" {...field} />
              </FormControl>
              <FormDescription>
                A brief title describing what you're looking for
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe what you're looking for in detail" 
                  className="min-h-[120px]" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Provide details about what you're looking for
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="species"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Species</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a species" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SPECIES_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The type of animal you're looking for
              </FormDescription>
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={createRequest.isPending}>
          {createRequest.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : "Submit Request"}
        </Button>
      </form>
    </Form>
  );
}