import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Search, Trash2, Edit, Mail, Phone } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Auction, insertAuctionSchema, type Bid } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuctionCard from "@/components/auction-card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import React, { useEffect } from "react";
import { FileUpload } from "@/components/file-upload";
import { User } from "lucide-react"; //moved here to remove duplicate
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import axios from 'axios';

function UserProfileDialog({ userId, username, role, onClose }: { userId: number; username: string; role: string; onClose: () => void }) {
  const { toast } = useToast();

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["/api/admin/profiles", userId],
    queryFn: () => fetch(`/api/admin/profiles/${userId}`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    }),
  });

  const { data: bids, isLoading: isLoadingBids } = useQuery({
    queryKey: ["/api/admin/user-bids", userId],
    queryFn: () => fetch(`/api/admin/users/${userId}/bids`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch bids");
      return res.json();
    }),
    enabled: role === "buyer",
  });

  const { data: auctions, isLoading: isLoadingAuctions } = useQuery({
    queryKey: ["/api/admin/user-auctions", userId],
    queryFn: () => fetch(`/api/admin/users/${userId}/auctions`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch auctions");
      return res.json();
    }),
    enabled: role === "seller" || role === "seller_admin",
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Profile: {username}</DialogTitle>
          <DialogDescription>
            View detailed information about this user
          </DialogDescription>
        </DialogHeader>

        {isLoadingProfile ? (
          <div className="flex justify-center p-4">
            <LoadingSpinner className="h-6 w-6" />
          </div>
        ) : !profile ? (
          <p className="text-muted-foreground">No profile information found</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">Contact Information</h3>
                <div className="space-y-2">
                  <p><span className="font-medium">Full Name:</span> {profile.fullName}</p>
                  <p><span className="font-medium">Email:</span> {profile.email}</p>
                  <p><span className="font-medium">Phone:</span> {profile.phoneNumber}</p>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Address</h3>
                <div className="space-y-2">
                  <p>{profile.address}</p>
                  <p>{profile.city}, {profile.state} {profile.zipCode}</p>
                  <p>{profile.country}</p>
                </div>
              </div>
            </div>

            {(role === "seller" || role === "seller_admin") && (
              <div>
                <h3 className="font-semibold mb-2">Business Information</h3>
                <div className="space-y-2">
                  <p><span className="font-medium">Business Name:</span> {profile.businessName}</p>
                  <p><span className="font-medium">Breed Specialty:</span> {profile.breedSpecialty}</p>
                  <p><span className="font-medium">NPIP Number:</span> {profile.npipNumber}</p>
                </div>
              </div>
            )}

            {role === "buyer" && (
              <div>
                <h3 className="font-semibold mb-4">Bid History</h3>
                {isLoadingBids ? (
                  <div className="flex justify-center">
                    <LoadingSpinner className="h-6 w-6" />
                  </div>
                ) : !bids?.length ? (
                  <p className="text-muted-foreground">No bids found</p>
                ) : (
                  <div className="space-y-2">
                    {bids.map((bid) => (
                      <div key={bid.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">${bid.amount}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(bid.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <Badge>{bid.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(role === "seller" || role === "seller_admin") && (
              <div>
                <h3 className="font-semibold mb-4">Auctions</h3>
                {isLoadingAuctions ? (
                  <div className="flex justify-center">
                    <LoadingSpinner className="h-6 w-6" />
                  </div>
                ) : !auctions?.length ? (
                  <p className="text-muted-foreground">No auctions found</p>
                ) : (
                  <div className="space-y-2">
                    {auctions.map((auction) => (
                      <div key={auction.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{auction.title}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge>{auction.species}</Badge>
                              <Badge variant="outline">{auction.category}</Badge>
                            </div>
                          </div>
                          <ViewBidsDialog
                            auctionId={auction.id}
                            auctionTitle={auction.title}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Update the ViewBidsDialog component
function ViewBidsDialog({ auctionId, auctionTitle }: { auctionId: number; auctionTitle: string }) {
  const { toast } = useToast();

  const { data: bids, isLoading } = useQuery<Bid[]>({
    queryKey: ["/api/admin/bids", auctionId],
    queryFn: () =>
      fetch(`/api/admin/bids?auctionId=${auctionId}`).then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bids");
        return res.json();
      }),
  });

  const deleteBidMutation = useMutation({
    mutationFn: async (bidId: number) => {
      await apiRequest("DELETE", `/api/admin/bids/${bidId}`);
    },
    onSuccess: () => {
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bids", auctionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });

      // Force refresh data
      queryClient.refetchQueries({ queryKey: ["/api/admin/bids", auctionId] });
      queryClient.refetchQueries({ queryKey: ["/api/auctions"] });

      toast({
        title: "Success",
        description: "Bid has been deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          View Bids
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bids for {auctionTitle}</DialogTitle>
          <DialogDescription>
            Manage bids for this auction
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-4">
            <LoadingSpinner className="h-6 w-6" />
          </div>
        ) : !bids?.length ? (
          <p className="text-muted-foreground text-center py-4">No bids found</p>
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => (
              <div key={bid.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Bid Amount: ${bid.amount}</p>
                  <p className="text-sm text-muted-foreground">
                    Bidder ID: {bid.bidderId}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Time: {new Date(bid.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Bid</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this bid? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            deleteBidMutation.mutate(bid.id);
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Update the EditAuctionDialog component to better handle dates and match new auction form
function EditAuctionDialog({ auction }: { auction: Auction }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagesToRemove, setImagesToRemove] = useState<string[]>([]);

  // Format dates for the form's datetime-local input
  const formatDateForInput = (dateString: string) => {
    const date = new Date(dateString);
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16); // Format as "YYYY-MM-DDThh:mm"
  };

  const form = useForm({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: auction.title,
      description: auction.description,
      species: auction.species,
      category: auction.category,
      startPrice: auction.startPrice / 100, // Convert from cents to dollars
      reservePrice: auction.reservePrice / 100,
      startDate: formatDateForInput(auction.startDate),
      endDate: formatDateForInput(auction.endDate),
      imageUrl: auction.imageUrl || "",
      images: auction.images || [],
    },
  });

  const updateAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      // Convert form data to the correct format
      const formData = new FormData();

      // Convert prices from dollars to cents and format dates
      const dataToSend = {
        ...data,
        startPrice: Math.round(Number(data.startPrice) * 100),
        reservePrice: Math.round(Number(data.reservePrice) * 100),
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
      };

      // Add basic auction data
      Object.keys(dataToSend).forEach(key => {
        if (key !== 'files' && key !== 'images') {
          formData.append(key, dataToSend[key].toString());
        }
      });

      // Add new images
      selectedFiles.forEach(file => {
        formData.append('images', file);
      });

      // Add list of images to remove
      formData.append('imagesToRemove', JSON.stringify(imagesToRemove));

      // Keep existing images that weren't removed
      const remainingImages = auction.images?.filter(img => !imagesToRemove.includes(img)) || [];
      formData.append('existingImages', JSON.stringify(remainingImages));

      // For date updates, use JSON instead of FormData
      if (data.startDate || data.endDate) {
        console.log("Sending direct JSON for date update:", {
          startDate: data.startDate,
          endDate: data.endDate
        });

        return await axios.patch(`/api/admin/auctions/${auction.id}`, {
          startDate: data.startDate,
          endDate: data.endDate
        });
      } else {
        // For other updates, use FormData
        return await axios.patch(`/api/admin/auctions/${auction.id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      setOpen(false);
      toast({
        title: "Success",
        description: `Successfully updated "${data.title}"`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleImageRemove = (imageUrl: string) => {
    setImagesToRemove(prev => [...prev, imageUrl]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Auction</DialogTitle>
          <DialogDescription>
            Make changes to the auction details below.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => updateAuctionMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                    <Textarea {...field} />
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
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
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
                        step="0.01"
                        min="0"
                        {...field}
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
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                        }}
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
                    <FormLabel>End Date and Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <div>
                <FormLabel>Current Images</FormLabel>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  {auction.images?.map((imageUrl, index) => (
                    !imagesToRemove.includes(imageUrl) && (
                      <div key={index} className="relative group">
                        <img
                          src={imageUrl}
                          alt={`Auction image ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg"
                          onError={(e) => {
                            e.currentTarget.src = '/images/placeholder.jpg';
                          }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleImageRemove(imageUrl)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  ))}
                </div>
              </div>

              <div>
                <FormLabel>Upload New Images</FormLabel>
                <FileUpload
                  multiple
                  onFilesChange={setSelectedFiles}
                  accept="image/*"
                  maxFiles={5}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateAuctionMutation.isPending}
              >
                {updateAuctionMutation.isPending ? (
                  <LoadingSpinner className="h-4 w-4 mr-2" />
                ) : null}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Update the AdminDashboard component to properly handle pending auctions
function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [auctionSearchTerm, setAuctionSearchTerm] = useState("");
  const [buyerSearchTerm, setBuyerSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string; role: string } | null>(null);

  if (!user || (user.role !== "admin" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  // Query for pending auctions (not approved)
  const { data: pendingAuctions, isLoading: isLoadingPendingAuctions } = useQuery({
    queryKey: ["/api/admin/auctions", { approved: false }],
    queryFn: () => fetch('/api/admin/auctions?approved=false').then(res => {
      if (!res.ok) throw new Error("Failed to fetch pending auctions");
      return res.json();
    })
  });

  // Query for approved auctions
  const { data: approvedAuctions, isLoading: isLoadingApprovedAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/auctions", { approved: true }],
  });

  const deleteAuctionMutation = useMutation({
    mutationFn: async (auctionId: number) => {
      const response = await fetch(`/api/admin/auctions/${auctionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete auction');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction has been deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter approved auctions based on search term
  const filteredActiveAuctions = approvedAuctions?.filter(auction =>
    auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
    auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase())
  );

  const { data: pendingUsers, isLoading: isLoadingPending } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { approved: false, role: "seller" }],
  });

  const { data: approvedSellers, isLoading: isLoadingApproved } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { approved: true, role: ["seller", "seller_admin"] }],
  });

  const { data: buyers, isLoading: isLoadingBuyers } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { role: "buyer" }],
  });


  const filteredBuyers = buyers?.filter((buyer) =>
    buyer.username.toLowerCase().includes(buyerSearchTerm.toLowerCase()) ||
    buyer.email?.toLowerCase().includes(buyerSearchTerm.toLowerCase())
  );

  const filteredSellers = approvedSellers?.filter((seller) =>
    (seller.role === "seller" || seller.role === "seller_admin") &&
    seller.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const realPendingUsers = pendingUsers?.filter((user) => user.role === "seller" && !user.approved);

  const now = new Date();
  const filteredCompletedAuctions = approvedAuctions?.filter((auction) =>
    new Date(auction.endDate) <= now &&
    (auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase()))
  );

  const approveAuctionMutation = useMutation({
    mutationFn: async (auctionId: number) => {
      await apiRequest("POST", `/api/admin/auctions/${auctionId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction has been approved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User profile has been deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage user accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending">
              <TabsList className="w-full">
                <TabsTrigger value="pending">
                  Pending Sellers ({realPendingUsers?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="sellers">
                  Approved Sellers ({filteredSellers?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="buyers">
                  Buyers ({filteredBuyers?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                {isLoadingPending ? (
                  <div className="flex justify-center">
                    <LoadingSpinner className="h-8 w-8" />
                  </div>
                ) : !realPendingUsers?.length ? (
                  <p className="text-muted-foreground">No pending sellers</p>
                ) : (
                  <div className="space-y-4">
                    {realPendingUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <button
                            className="font-medium hover:underline"
                            onClick={() => setSelectedUser({ id: user.id, username: user.username, role: user.role })}
                          >
                            {user.username}
                          </button>
                          <Badge variant="outline">{user.role}</Badge>
                        </div>
                        <div className="flex gap-2">
                          {user.hasProfile && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this user's profile? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteProfileMutation.mutate(user.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sellers">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search sellers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {isLoadingApproved ? (
                    <div className="flex justify-center">
                      <LoadingSpinner className="h-8 w-8" />
                    </div>
                  ) : !filteredSellers?.length ? (
                    <p className="text-muted-foreground">No sellers found</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredSellers.map((seller) => (
                        <div
                          key={seller.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div>
                            <button
                              className="font-medium hover:underline"
                              onClick={() => setSelectedUser({ id: seller.id, username: seller.username, role: seller.role })}
                            >
                              {seller.username}
                            </button>
                            <Badge variant="outline">{seller.role}</Badge>
                          </div>
                          <div className="flex gap-2">
                            {seller.hasProfile && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this seller's profile? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteProfileMutation.mutate(seller.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="buyers">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search buyers..."
                      value={buyerSearchTerm}
                      onChange={(e) => setBuyerSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {isLoadingBuyers ? (
                    <div className="flex justify-center">
                      <LoadingSpinner className="h-8 w-8" />
                    </div>
                  ) : !filteredBuyers?.length ? (
                    <p className="textmuted-foreground">No buyers found</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredBuyers.map((buyer) => (
                        <div
                          key={buyer.id}
                          className="flex items-center justifybetween p-4 border rounded-lg"
                        >
                          <div>
                            <button
                              className="font-medium hover:underline"
                              onClick={() => setSelectedUser({ id: buyer.id, username: buyer.username, role: buyer.role })}
                            >
                              {buyer.username}
                            </button>
                            <p className="text-sm text-muted-foreground">
                              {buyer.email || "No email provided"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {buyer.hasProfile && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this buyer's profile? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteProfileMutation.mutate(buyer.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auctions</CardTitle>
            <CardDescription>Manage auction listings</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending">
              <TabsList className="w-full">
                <TabsTrigger value="pending">
                  Pending ({pendingAuctions?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="active">
                  Active ({filteredActiveAuctions?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({filteredCompletedAuctions?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                {isLoadingPendingAuctions ? (
                  <div className="flex justify-center">
                    <LoadingSpinner className="h-8 w-8" />
                  </div>
                ) : !pendingAuctions?.length ? (
                  <p className="text-muted-foreground">No pending auctions</p>
                ) : (
                  <div className="space-y-4">
                    {pendingAuctions.map((auction) => {
                        // Find the seller in the approvedSellers array
                        const seller = approvedSellers?.find(seller => seller.id === auction.sellerId);
                        return (
                          <div
                            key={auction.id}
                            className="flex items-center justify-between p-4 border rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{auction.title}</p>
                              <div className="flex gap-2 mt-1">
                                <Badge>{auction.species}</Badge>
                                <Badge variant="outline">{auction.category}</Badge>
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                <p>
                                  <span className="font-semibold">Seller: </span>
                                  {seller ? seller.username : "Unknown"}
                                  {seller?.email && ` (${seller.email})`}
                                </p>
                                {auction.sellerProfile && (
                                  <>
                                    <p>
                                      <span className="font-semibold">Business: </span>
                                      {auction.sellerProfile.businessName || "Not specified"}
                                    </p>
                                    <p>
                                      <span className="font-semibold">Contact: </span>
                                      {auction.sellerProfile.email || "Not specified"}
                                    </p>
                                    <p>
                                      <span className="font-semibold">Location: </span>
                                      {auction.sellerProfile.state ? `${auction.sellerProfile.city}, ${auction.sellerProfile.state}` : "Not specified"}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveAuctionMutation.mutate(auction.id)}
                                disabled={approveAuctionMutation.isPending}
                              >
                                {approveAuctionMutation.isPending && (
                                  <LoadingSpinner className="mr-2 h-4 w-4" />)}
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Approve
                              </Button>

                              <EditAuctionDialog auction={auction} />

                              <ViewBidsDialog
                                auctionId={auction.id}
                                auctionTitle={auction.title}
                              />

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Auction</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this auction? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteAuctionMutation.mutate(auction.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="active">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search auctions..."
                      value={auctionSearchTerm}
                      onChange={(e) => setAuctionSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {isLoadingApprovedAuctions ? (
                    <div className="flex justify-center">
                      <LoadingSpinner className="h-8 w-8" />
                    </div>
                  ) : !filteredActiveAuctions?.length ? (
                    <p className="text-muted-foreground">No active auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredActiveAuctions.map((auction) => (
                        <div key={auction.id} className="relative">
                          <div className="absolute top-2 right-2 z-10 flex gap-2">
                            <EditAuctionDialog auction={auction} />
                            <ViewBidsDialog
                              auctionId={auction.id}
                              auctionTitle={auction.title}
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Auction</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this auction? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteAuctionMutation.mutate(auction.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <AuctionCard auction={auction} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="completed">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search completed auctions..."
                      value={auctionSearchTerm}
                      onChange={(e) => setAuctionSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {isLoadingApprovedAuctions ? (
                    <div className="flex justify-center">
                      <LoadingSpinner className="h-8 w-8" />
                    </div>
                  ) : !filteredCompletedAuctions?.length ? (
                    <p className="text-muted-foreground">No completed auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredCompletedAuctions.map((auction) => (
                        <div key={auction.id} className="relative">
                          <div className="absolute top-2 right-2 z-10 flex gap-2">
                            <ViewBidsDialog
                              auctionId={auction.id}
                              auctionTitle={auction.title}
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Auction</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this auction? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteAuctionMutation.mutate(auction.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <AuctionCard auction={auction} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      {selectedUser && (
        <UserProfileDialog
          userId={selectedUser.id}
          username={selectedUser.username}
          role={selectedUser.role}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}

export default AdminDashboard;