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

const SPECIES_OPTIONS = ["bantam", "standard", "waterfowl", "quail", "other"];

const CATEGORY_OPTIONS = [
  "Show Quality",
  "Purebred & Production",
  "Fun & Mixed",
];

export function BuyerRequestForm({ onClose }: { onClose?: () => void }) {
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
      const response = await apiRequest("POST", "/api/buyer-requests", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyer-requests"] });
      toast({
        title: "Request Created",
        description: "Your request has been created successfully.",
      });
      form.reset();
      if (onClose) {
        onClose();
      }
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
        toast({
          title: "Error Creating Request",
          description: error.message || "Failed to create request",
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
                <Input placeholder="e.g., Looking for Silver Laced Wyandottes" {...field} />
              </FormControl>
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

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe what you're looking for..." 
                  {...field} 
                />
              </FormControl>
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