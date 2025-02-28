import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAuctionSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/file-upload";
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

export default function NewAuction() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Redirect if not a seller or seller_admin
  if (!user || (user.role !== "seller" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  const form = useForm({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: "",
      description: "",
      species: "",
      category: "Show Quality", // Default to "show" category
      startPrice: 0,
      reservePrice: 0,
      startDate: `${new Date().toISOString().split("T")[0]}T00:00`,
      endDate: `${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}T23:59`,
    },
  });

  const createAuctionMutation = useMutation({
    mutationFn: async (auctionData: any) => {
      console.log("Form data before submission:", auctionData);

      // Create FormData for the multipart/form-data request
      const formData = new FormData();

      // Append all form fields
      Object.keys(auctionData).forEach(key => {
        if (key !== 'files' && key !== 'images') {
          // Convert prices to cents.  This assumes the API expects cents.  Adjust as needed.
          if (key === 'startPrice' || key === 'reservePrice') {
            formData.append(key, (auctionData[key] * 100).toString());
          } else {
            formData.append(key, auctionData[key].toString());
          }
        }
      });

      // Handle file uploads
      selectedFiles.forEach(file => {
        formData.append('images', file);
      });

      console.log("Submitting FormData with files:", selectedFiles.length);

      // Use fetch directly to properly handle FormData with files
      const res = await fetch("/api/auctions", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create auction");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your auction has been created and is pending approval",
      });
      setLocation("/seller/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating auction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Create New Auction</h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => {
            console.log("Form data before submission:", data);
            createAuctionMutation.mutate({...data});
          })}
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
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={field.value || ""}
                      onChange={(e) => {
                        field.onChange(e.target.value ? parseFloat(e.target.value) : "");
                      }}
                    />
                  </FormControl>
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
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={field.value || ""}
                      onChange={(e) => {
                        field.onChange(e.target.value ? parseFloat(e.target.value) : "");
                      }}
                    />
                  </FormControl>
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Auction
          </Button>
        </form>
      </Form>
    </div>
  );
}