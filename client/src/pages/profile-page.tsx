import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProfileSchema, type InsertProfile, type Profile } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import { Loader2, Bell } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { FileUpload } from "@/components/file-upload";
import { Separator } from "@/components/ui/separator";
import React, { useState } from 'react';

export default function ProfilePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [debugInfo, setDebugInfo] = useState<string>("");

  if (!user) {
    return <Redirect to="/auth" />;
  }

  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: [`/api/profile`],
  });

  const form = useForm<InsertProfile>({
    resolver: zodResolver(insertProfileSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phoneNumber: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      bio: "",
      isPublicBio: true,
      profilePicture: "",
      businessName: "",
      breedSpecialty: "",
      npipNumber: "",
      emailBidNotifications: true,
      emailAuctionNotifications: true,
      emailPaymentNotifications: true,
      emailAdminNotifications: true,
      emailDailyDigest: true, // Add missing field
      userId: user.id, // Add required field
    },
  });

  React.useEffect(() => {
    if (profile) {
      console.log("Setting form values from profile:", profile);
      form.reset({
        ...profile,
        userId: user.id // Ensure userId is always set
      });
    }
  }, [profile, form]);

  const createProfileMutation = useMutation({
    mutationFn: async (data: InsertProfile) => {
      console.log("Starting profile mutation with data:", data);
      setDebugInfo("Submitting profile data...");
      
      if (!user?.id) {
        throw new Error("User ID not found");
      }

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({...data, userId: user.id}),
        credentials: "include",
      });

      console.log("Profile submission response status:", res.status);

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Profile submission error:", errorData);
        setDebugInfo(`Server error: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.message || errorData.error || "Failed to save profile");
      }

      const responseData = await res.json();
      console.log("Profile submission successful:", responseData);
      return responseData;
    },
    onSuccess: () => {
      console.log("Profile mutation succeeded, invalidating queries");
      setDebugInfo("Profile saved successfully!");

      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      const currentUser = queryClient.getQueryData(['/api/user']);
      if (currentUser) {
        queryClient.setQueryData(['/api/user'], {
          ...currentUser,
          hasProfile: true
        });
      }

      toast({
        title: "Profile saved",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("Profile mutation error:", error);
      setDebugInfo(`Error: ${error.message}`);

      toast({
        title: "Error saving profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (profileLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (formData: InsertProfile) => {
    console.log("Form submitted with data:", formData);
    setDebugInfo("Processing form submission...");

    try {
      if (!user?.id) {
        throw new Error("User ID not found. Please try logging in again.");
      }

      // Ensure userId is included
      const dataWithUserId = {
        ...formData,
        userId: user.id
      };

      console.log("Submitting profile data with userId:", dataWithUserId);
      await createProfileMutation.mutateAsync(dataWithUserId);
    } catch (error) {
      console.error("Form submission error:", error);
      setDebugInfo(`Submission error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save profile",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        <Button
          variant="destructive"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Logout
        </Button>
      </div>

      {/* Debug Information */}
      {debugInfo && (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <p className="text-sm font-mono">Debug: {debugInfo}</p>
        </div>
      )}

      {/* Form Validation Errors */}
      {Object.keys(form.formState.errors).length > 0 && (
        <div className="mb-4 p-4 bg-red-50 text-red-900 rounded">
          <h3 className="font-semibold">Form Validation Errors:</h3>
          <pre className="text-sm mt-2">
            {JSON.stringify(form.formState.errors, null, 2)}
          </pre>
        </div>
      )}

      <div className="text-muted-foreground mb-6">
        Please complete your profile to participate in auctions.
      </div>

      <Form {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!user?.id) {
              toast({
                title: "Error",
                description: "User ID not found. Please try logging in again.",
                variant: "destructive",
              });
              return;
            }
            form.handleSubmit(handleSubmit)(e);
          }}
          className="space-y-6"
        >
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Profile Picture</h2>
            <FileUpload
              onFilesChange={(files) => {
                if (files.length > 0) {
                  form.setValue("profilePicture", URL.createObjectURL(files[0]));
                }
              }}
              accept="image/*"
              maxFiles={1}
            />
          </div>

          <Separator className="my-6" />

          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Personal Information</h2>

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormDescription>
                    Your email address for notifications and communications
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+1 (555) 555-5555" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="zipCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {user.role === "seller" || user.role === "seller_admin" && (
            <>
              <Separator className="my-6" />

              <div className="space-y-6 bg-background/50 rounded-lg p-4 sm:p-6 border border-border/50">
                <h2 className="text-lg font-semibold">Seller Information</h2>

                <FormField
                  control={form.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="breedSpecialty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Breed Specialty</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Silkies, Plymouth Rocks" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="npipNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NPIP Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter your NPIP certification number" />
                      </FormControl>
                      <FormDescription>
                        National Poultry Improvement Plan certification number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}

          <Separator className="my-6" />

          <div className="space-y-6 bg-background/50 rounded-lg p-4 sm:p-6 border border-border/50">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Email Notifications</h2>
            </div>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="emailBidNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Bid Notifications</FormLabel>
                      <FormDescription>
                        Receive emails when someone bids on your auctions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emailAuctionNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Auction Updates</FormLabel>
                      <FormDescription>
                        Receive emails about auction status changes
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emailPaymentNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Payment Notifications</FormLabel>
                      <FormDescription>
                        Receive emails about payment updates and transactions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emailAuctionNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Auction Notifications</FormLabel>
                      <FormDescription>
                        Receive emails when auctions are ending or have completed
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {(user.role === "seller" || user.role === "seller_admin") && (
                <FormField
                  control={form.control}
                  name="emailAdminNotifications"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Admin Notifications</FormLabel>
                        <FormDescription>
                          Receive emails about admin actions and approvals
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Bio</h2>

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Tell us about yourself..."
                    />
                  </FormControl>
                  <FormDescription>
                    Share your experience with poultry or what interests you about the auction.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isPublicBio"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Public Bio</FormLabel>
                    <FormDescription>
                      Make your bio visible to other users
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              type="submit"
              className="w-full sm:w-auto px-8"
              disabled={createProfileMutation.isPending}
              onClick={() => setDebugInfo("Submit button clicked")}
            >
              {createProfileMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Profile"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}