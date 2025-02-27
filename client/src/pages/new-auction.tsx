import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAuctionSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { useState } from 'react';


function FileUpload({ multiple, maxFiles, onFilesChange }) {
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (maxFiles && files.length > maxFiles) {
      // Handle exceeding maxFiles limit
      console.warn(`Maximum ${maxFiles} files allowed.`);
      return;
    }
    setSelectedFiles(files);
    onFilesChange(files);
  };

  return (
    <div>
      <input
        type="file"
        multiple={multiple}
        onChange={handleFileChange}
      />
      {/* Display selected files (optional) */}
      {selectedFiles.length > 0 && (
        <ul>
          {selectedFiles.map((file) => (
            <li key={file.name}>{file.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}


export default function NewAuction() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedFiles, setSelectedFiles] = useState([]); // Add state for selected files

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
      category: "quality",
      imageUrl: "",
      startPrice: 0,
      reservePrice: 0,
      startDate: new Date().toISOString().split('T')[0], // Already in string format
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Already in string format
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
          formData.append(key, auctionData[key].toString());
        }
      });

      // Handle file uploads
      if (selectedFiles.length > 0) {
        selectedFiles.forEach(file => {
          formData.append('images', file);
        });
      } else if (auctionData.imageUrl) {
        // If no files selected but imageUrl is provided
        formData.append('imageUrl', auctionData.imageUrl);
      } else {
        // Make sure we have an empty string instead of undefined
        formData.append('imageUrl', '');
      }

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
            createAuctionMutation.mutate(data);
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
                      <SelectItem value="chicken">Chicken</SelectItem>
                      <SelectItem value="duck">Duck</SelectItem>
                      <SelectItem value="turkey">Turkey</SelectItem>
                      <SelectItem value="quail">Quail</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
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
                      <SelectItem value="quality">Show Quality/Purebred</SelectItem>
                      <SelectItem value="production">Production/Mixed</SelectItem>
                      <SelectItem value="fun">Fun/Hobby</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Images</FormLabel>
                <FormControl>
                  <div className="space-y-2">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files) {
                          setSelectedFiles(Array.from(e.target.files));
                        }
                      }}
                      className="w-full"
                    />
                    {selectedFiles.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {selectedFiles.length} file(s) selected
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fallback Image URL (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter fallback image URL" />
                </FormControl>
                <FormDescription>
                  Used if no images are uploaded
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />


          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Price ($)</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="number" 
                      min="1" 
                      onChange={(e) => field.onChange(Number(e.target.value))}
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
                      {...field} 
                      type="number" 
                      min={form.watch('startPrice')} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
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
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="date" 
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="date" 
                      min={form.watch('startDate')}
                    />
                  </FormControl>
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