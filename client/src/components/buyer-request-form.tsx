import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBuyerRequestSchema, type InsertBuyerRequest } from "@shared/schema";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const SPECIES_OPTIONS = [
  "Bantam",
  "Standard",
  "Waterfowl",
  "Quail",
  "Other",
];

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
    mutationFn: (data: InsertBuyerRequest) =>
      apiRequest("/api/buyer-requests", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyer-requests"] });
      toast({
        title: "Request Created",
        description: "Your request has been created successfully.",
      });
      form.reset();
    },
    onError: (error) => {
      if (error.message === "Unauthorized") {
        toast({
          title: "Authentication Required",
          description: "Please sign in or create an account to submit a request.",
          variant: "destructive",
        });
        navigate("/auth");
      } else {
        toast({
          title: "Error",
          description: "Failed to create request. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  function onSubmit(data: InsertBuyerRequest) {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in or create an account to submit a request.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    createRequest.mutate(data);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Looking for Silver Laced Wyandottes" {...field} />
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
                  {SPECIES_OPTIONS.map((species) => (
                    <SelectItem key={species} value={species.toLowerCase()}>
                      {species}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the type of poultry you're interested in
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
              <FormDescription>
                Select the quality category you're looking for
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
                  placeholder="Describe what you're looking for, including any specific requirements..."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Include details about quantity, age, color preferences, etc.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={createRequest.isPending}>
          {createRequest.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Submit Request
        </Button>
      </form>
    </Form>
  );
}