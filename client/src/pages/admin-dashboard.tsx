import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, Search, Trash2, Edit } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Auction, Bid } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAuctionSchema } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import axios from "axios";
import AuctionCard from "@/components/auction-card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { FileUpload } from "@/components/file-upload";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import * as z from 'zod';

// Types
type SellerStripeStatus = {
  sellerId: number;
  status: "not_started" | "pending" | "verified" | "rejected";
};

type User = {
  id: number;
  username: string;
  email?: string;
  role: string;
  approved: boolean;
  hasProfile: boolean;
};

type SellerProfile = {
  userId: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  businessName: string;
  breedSpecialty: string;
  npipNumber: string;
  paypalAccountStatus?: "verified" | "pending" | "not_started"; // Added paypalAccountStatus
};


function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [auctionSearchTerm, setAuctionSearchTerm] = useState("");
  const [buyerSearchTerm, setBuyerSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string; role: string } | null>(null);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [deleteAuctionId, setDeleteAuctionId] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [viewBidsDialogOpen, setViewBidsDialogOpen] = useState(false);
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);
  const [selectedAuctionTitle, setSelectedAuctionTitle] = useState('');


  if (!user || (user.role !== "admin" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  // User Management Queries
  const { data: pendingUsers, isLoading: isLoadingPending } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { approved: false, role: "seller" }],
  });

  const { data: approvedSellers, isLoading: isLoadingApproved } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { approved: true, role: ["seller", "seller_admin"] }],
  });

  const { data: buyers, isLoading: isLoadingBuyers } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { role: "buyer" }],
  });

  const { data: sellerStripeStatuses } = useQuery<SellerStripeStatus[]>({
    queryKey: ["/api/admin/sellers/stripe-status"],
    enabled: !!user && (user.role === "admin" || user.role === "seller_admin"),
  });

  // Get seller profiles for checking completeness
  const { data: sellerProfiles } = useQuery<SellerProfile[]>({
    queryKey: ["/api/admin/profiles"],
    enabled: !!user && (user.role === "admin" || user.role === "seller_admin"),
  });

  // Auction Management Queries
  const { data: pendingAuctions, isLoading: isLoadingPendingAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/admin/auctions", { approved: false }],
  });

  const { data: approvedAuctions, isLoading: isLoadingApprovedAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/auctions", { approved: true }],
  });

  // Mutations
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sellers/stripe-status"] });
      toast({
        title: "Success",
        description: "User has been deleted",
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

  const deleteAuctionMutation = useMutation({
    mutationFn: async (auctionId: number) => {
      await apiRequest("DELETE", `/api/admin/auctions/${auctionId}`);
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

  const approveAuctionMutation = useMutation({
    mutationFn: async (auctionId: number) => {
      console.log("Approving auction:", auctionId);
      return fetch(`/api/admin/auctions/${auctionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }).then(res => {
        if (!res.ok) throw new Error("Failed to approve auction");
        return res.json();
      });
    },
    onSuccess: () => {
      console.log("Successfully approved auction");
      // Invalidate both queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["adminAuctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      toast({
        title: "Success",
        description: "Auction has been approved"
      });
    },
    onError: (error) => {
      console.error("Error approving auction:", error);
      toast({
        title: "Error",
        description: "Failed to approve auction: " + error.message,
        variant: "destructive"
      });
    }
  });

  // Add mutation for approving sellers
  const approveSellerMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/admin/users/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "Seller has been approved",
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

  // Filtered Lists
  const realPendingUsers = pendingUsers?.filter(user => !user.approved && user.role === "seller") || [];
  const filteredSellers = approvedSellers?.filter(seller =>
    seller.approved &&
    (seller.role === "seller" || seller.role === "seller_admin") &&
    seller.username.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredBuyers = buyers?.filter((buyer) =>
    buyer.username.toLowerCase().includes(buyerSearchTerm.toLowerCase()) ||
    buyer.email?.toLowerCase().includes(buyerSearchTerm.toLowerCase())
  ) || [];

  const filteredActiveAuctions = useMemo(() => {
    if (!approvedAuctions) return [];
    const now = new Date();
    const active = approvedAuctions.filter(auction =>
      auction.approved &&
      new Date(auction.endDate) > now &&
      auction.status === "active"
    );
    if (!auctionSearchTerm) return active;

    return active.filter(auction =>
      auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.species.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.category.toLowerCase().includes(auctionSearchTerm.toLowerCase())
    );
  }, [approvedAuctions, auctionSearchTerm]);

  const filteredPendingAuctions = useMemo(() => {
    if (!pendingAuctions) return [];
    return pendingAuctions.filter(auction => !auction.approved);
  }, [pendingAuctions]);

  const filteredCompletedAuctions = useMemo(() => {
    if (!approvedAuctions) return [];
    const now = new Date();
    const completed = approvedAuctions.filter(auction =>
      new Date(auction.endDate) <= now ||
      auction.status === "completed" ||
      auction.status === "ended" ||
      auction.status === "voided"
    );
    if (!auctionSearchTerm) return completed;

    return completed.filter(auction =>
      auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.species.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.category.toLowerCase().includes(auctionSearchTerm.toLowerCase())
    );
  }, [approvedAuctions, auctionSearchTerm]);

  const closeEditDialog = () => {
    setSelectedAuction(null);
  };

  // Add this function to handle editing auctions
  const handleEditAuction = (auction: Auction) => {
    setSelectedAuction(auction);
  };

  const updateAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      const newImages = Array.isArray(data.images) ? data.images : [];
      try {
        const formData = {
          ...data,
          images: newImages,
          reservePrice: Number(data.reservePrice),
          startPrice: Number(data.startPrice),
          startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
          endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
        };

        // Use selectedAuction.id for the API request
        return await apiRequest("PATCH", `/api/admin/auctions/${selectedAuction?.id}`, formData);
      } catch (error) {
        console.error("[EditAuction] Error during form preparation:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction updated successfully",
      });
      onClose?.();
    },
    onError: (error: any) => {
      console.error("[EditAuction] Update failed:", error);
      toast({
        title: "Error",
        description: "Failed to update auction: " + error.message,
        variant: "destructive",
      });
    },
  });


  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid gap-8">
        {/* Users Card */}
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage user accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending">
              <TabsList className="w-full">
                <TabsTrigger value="pending">
                  Pending Sellers ({realPendingUsers.length})
                </TabsTrigger>
                <TabsTrigger value="sellers">
                  Approved Sellers ({filteredSellers.length})
                </TabsTrigger>
                <TabsTrigger value="buyers">
                  Buyers ({filteredBuyers.length})
                </TabsTrigger>
              </TabsList>

              {/* User Management Tabs Content */}
              <TabsContent value="pending">
                {isLoadingPending ? (
                  <div className="flex justify-center">
                    <LoadingSpinner className="h-8 w-8" />
                  </div>
                ) : !realPendingUsers.length ? (
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
                          <Button
                            onClick={() => approveSellerMutation.mutate(user.id)}
                            disabled={approveSellerMutation.isPending}
                            variant="outline"
                            size="sm"
                          >
                            {approveSellerMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Approve Seller
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this user? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUserMutation.mutate(user.id)}
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
                  ) : !filteredSellers.length ? (
                    <p className="text-muted-foreground">No sellers found</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredSellers.map((seller) => (
                        <Card key={seller.id}>
                          <CardHeader>
                            <CardTitle>{seller.username}</CardTitle>
                            <CardDescription>
                              Role: {seller.role}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="mt-2 flex flex-col gap-1">
                              <div className="text-sm font-medium">PayPal Status:</div>
                              {sellerProfiles?.find(p => p.userId === seller.id)?.paypalAccountStatus === "verified" ? (
                                <Badge variant="success">Verified</Badge>
                              ) : sellerProfiles?.find(p => p.userId === seller.id)?.paypalAccountStatus === "pending" ? (
                                <Badge variant="warning">Pending</Badge>
                              ) : (
                                <Badge variant="destructive">Not Started</Badge>
                              )}
                            </div>
                            <div className="mt-2 flex flex-col gap-1">
                              <div className="text-sm font-medium">Profile Completeness:</div>
                              {sellerProfiles?.find(p => p.userId === seller.id) ? (
                                <div className="flex flex-col gap-1 text-sm">
                                  <div className="flex items-center gap-1">
                                    <span>NPIP:</span>
                                    {sellerProfiles?.find(p => p.userId === seller.id)?.npipNumber ? (
                                      <Badge variant="success">Complete</Badge>
                                    ) : (
                                      <Badge variant="destructive">Missing</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span>Email:</span>
                                    {sellerProfiles?.find(p => p.userId === seller.id)?.email ? (
                                      <Badge variant="success">Complete</Badge>
                                    ) : (
                                      <Badge variant="destructive">Missing</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span>Address:</span>
                                    {sellerProfiles?.find(p => p.userId === seller.id)?.address ? (
                                      <Badge variant="success">Complete</Badge>
                                    ) : (
                                      <Badge variant="destructive">Missing</Badge>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="destructive">No Profile</Badge>
                              )}
                            </div>
                            {/* Add approval button for pending sellers */}
                            {!seller.approved && (
                              <div className="mt-4">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button>Approve Seller</Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Approve Seller</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to approve {seller.username} as a seller?
                                        {!sellerProfiles?.find(p => p.userId === seller.id)?.paypalAccountStatus || sellerProfiles?.find(p => p.userId === seller.id)?.paypalAccountStatus !== "verified" ? (
                                          <div className="mt-2 text-destructive">
                                            Warning: This seller has not completed their PayPal verification.
                                          </div>
                                        ) : null}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => {
                                          // Implement seller approval
                                          fetch(`/api/admin/sellers/${seller.id}/approve`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" }
                                          })
                                            .then(res => {
                                              if (!res.ok) throw new Error("Failed to approve seller");
                                              return res.json();
                                            })
                                            .then(() => {
                                              queryClient.invalidateQueries({ queryKey: ["/api/admin/sellers/stripe-status"] });
                                              toast({
                                                title: "Success",
                                                description: `${seller.username} has been approved as a seller.`
                                              });
                                            })
                                            .catch(err => {
                                              console.error("Error approving seller:", err);
                                              toast({
                                                title: "Error",
                                                description: "Failed to approve seller: " + err.message,
                                                variant: "destructive"
                                              });
                                            });
                                        }}
                                      >
                                        Approve
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </CardContent>
                          <div className="flex gap-2 p-4">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this seller? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(seller.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            {sellerProfiles?.find(p => p.userId === seller.id)?.paypalAccountStatus === "verified"
                              ? <CheckCircle2 className="h-4 w-4 text-green-500" title="PayPal account set up" />
                              : <AlertCircle className="h-4 w-4 text-amber-500" title="No PayPal account" />
                            }
                          </div>
                        </Card>
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
                  ) : !filteredBuyers.length ? (
                    <p className="text-muted-foreground">No buyers found</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredBuyers.map((buyer) => (
                        <div
                          key={buyer.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this buyer? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(buyer.id)}
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
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Auctions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Auctions</CardTitle>
            <CardDescription>Manage auction listings</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending">
              <TabsList className="w-full">
                <TabsTrigger value="pending">
                  Pending ({filteredPendingAuctions.length})
                </TabsTrigger>
                <TabsTrigger value="active">
                  Active ({filteredActiveAuctions.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({filteredCompletedAuctions.length})
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPendingAuctions.map((auction) => {
                      const seller = approvedSellers?.find(seller => seller.id === auction.sellerId);
                      const sellerPayPalStatus = sellerProfiles?.find(s => s.userId === auction.sellerId)?.paypalAccountStatus; // Use PayPal status
                      const isPayPalVerified = sellerPayPalStatus === "verified"; // Use PayPal verification

                      return (
                        <AuctionCard
                          key={auction.id}
                          auction={auction}
                          showStatus
                          actions={
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleEditAuction(auction)}
                                variant="outline"
                                size="sm"
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                              <Button
                                onClick={() => approveAuctionMutation.mutate(auction.id)}
                                disabled={approveAuctionMutation.isPending}
                                variant="default"
                                size="sm"
                              >
                                {approveAuctionMutation.isPending && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Approve
                              </Button>
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
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => {
                                  setSelectedAuctionId(auction.id);
                                  setSelectedAuctionTitle(auction.title);
                                  setViewBidsDialogOpen(true);
                                }}
                                className="ml-2"
                              >
                                View Bids
                              </Button>
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="active">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search active auctions..."
                      value={auctionSearchTerm}
                      onChange={(e) => setAuctionSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {isLoadingApprovedAuctions ? (
                    <div className="flex justify-center">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : !filteredActiveAuctions.length ? (
                    <p className="text-muted-foreground">No active auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredActiveAuctions.map((auction) => (
                        <AuctionCard
                          key={auction.id}
                          auction={auction}
                          showStatus
                          actions={
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleEditAuction(auction)}
                                variant="outline"
                                size="sm"
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
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
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => {
                                  setSelectedAuctionId(auction.id);
                                  setSelectedAuctionTitle(auction.title);
                                  setViewBidsDialogOpen(true);
                                }}
                                className="ml-2"
                              >
                                View Bids
                              </Button>
                            </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="completed">
                <div className="space-y-4">
                  {isLoadingApprovedAuctions ? (
                    <div className="flex justify-center">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : !filteredCompletedAuctions.length ? (
                    <p className="text-muted-foreground">No completed auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredCompletedAuctions.map((auction) => (
                        <AuctionCard
                          key={auction.id}
                          auction={auction}
                          actions={
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
                          }
                        />
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
      {selectedAuction && (
        <EditAuctionDialog
          auction={selectedAuction}
          onClose={closeEditDialog}
        />
      )}

      {/* View Bids Dialog */}
      <ViewBidsDialog 
        isOpen={viewBidsDialogOpen} 
        onClose={() => setViewBidsDialogOpen(false)} 
        auctionId={selectedAuctionId}
        auctionTitle={selectedAuctionTitle}
      />
    </div>
  );
}

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
            <LoadingSpinner className="h6 w-6" />
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
                  <p><span className="font-medium">PayPal Status:</span> {profile.paypalAccountStatus || "Not Started"}</p> {/* Added PayPal Status */}
                </div>
              </div>
            )}

            {role === "buyer" && (
              <div>
                <h3 className="font-semibold mb-4">Bid History</h3>
                {isLoadingBids ? (
                  <div className="flex justifycenter p-4">
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

function ViewBidsDialog({ auctionId, auctionTitle }: { auctionId: number; auctionTitle: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bids", auctionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}/bids`] });

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
          <div className="flex justifycenter p-4">
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
                    Bidder ID: {bid.bidderId}</p>
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

function EditAuctionDialog({ auction, onClose }: { auction: Auction; onClose?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof insertAuctionSchema>>({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: auction.title,
      description: auction.description,
      species: auction.species,
      category: auction.category,
      startPrice: auction.startPrice / 100, // Convert from cents to dollars
      reservePrice: auction.reservePrice ? auction.reservePrice / 100 : undefined, // Convert from cents to dollars
      startDate: new Date(auction.startDate),
      endDate: new Date(auction.endDate),
      imageUrl: auction.imageUrl || undefined,
      images: auction.images || [],
    },
  });

  const updateAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      // Ensure we have the correct image data structure
      const newImages = Array.isArray(data.images) ? data.images : [];
      try {
        const formData = {
          ...data,
          images: newImages,
          reservePrice: Number(data.reservePrice) * 100,
          startPrice: Number(data.startPrice) * 100,
          startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
          endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
        };
        console.log("[EditAuction] Submitting update:", {
          auctionId: auction.id,
          imageCount: formData.images.length,
          imageUrl: formData.imageUrl
        });
        return await apiRequest("PATCH", `/api/admin/auctions/${auction.id}`, formData);
      } catch (error) {
        console.error("[EditAuction] Error during form preparation:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction updated successfully",
      });
      if (onClose) onClose();
    },
    onError: (error: any) => {
      console.error("[EditAuction] Update failed:", error);
      toast({
        title: "Error",
        description: "Failed to update auction: " + error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: any) => {
    console.log("[EditAuction] Form submitted with values:", values);
    updateAuctionMutation.mutate(values);
  };

  return (
    <Dialog open onOpenChange={() => onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Auction</DialogTitle>
          <DialogDescription>
            Update the auction details below.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Title field */}
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

            {/* Description field */}
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

            {/* Species field */}
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select species" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bantam">Bantam</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="waterfowl">Waterfowl</SelectItem>
                      <SelectItem value="quail">Quail</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category field */}
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

            {/* Price fields */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Price</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
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
                    <FormLabel>Reserve Price</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Date fields */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={field.value.toISOString().slice(0, 16)}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
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
                        type="datetime-local"
                        value={field.value.toISOString().slice(0, 16)}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Image section */}
            <div className="space-y-2">
              <Label>Images</Label>
              {form.watch("images")?.length > 0 && (
                <div className="mb-4">
                  <Label>Current Images</Label>
                  <ScrollArea className="h-32 w-full rounded-md border">
                    <div className="flex gap-2 p-2">
                      {form.watch("images").map((url, index) => (
                        <div key={url} className="relative">
                          <img
                            src={url}
                            alt={`Auction image ${index + 1}`}
                            className="h-24 w-24 object-cover rounded-md"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -right-2 -top-2 h-6 w-6"
                            onClick={() => {
                              const currentImages = form.watch("images") || [];
                              const newImages = currentImages.filter((_, i) => i !== index);
                              form.setValue("images", newImages);

                              // Update primary image if needed
                              if (form.watch("imageUrl") === url) {
                                form.setValue("imageUrl", newImages[0] || "");
                              }
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="grid gap-4">
                <FileUpload
                  accept="image/*"
                  maxFiles={5}
                  onFilesChange={(urls: string[]) => {
                    const currentImages = form.watch("images") || [];
                    const newImages = [...currentImages, ...urls];
                    console.log("[EditAuction] Updating images:", {
                      current: currentImages,
                      new: urls,
                      combined: newImages
                    });
                    form.setValue("images", newImages);

                    if (!form.watch("imageUrl") && newImages.length > 0) {
                      form.setValue("imageUrl", newImages[0]);
                    }
                  }}
                  onRemove={(index: number) => {
                    const currentImages = form.watch("images") || [];
                    const newImages = currentImages.filter((_, i) => i !== index);
                    form.setValue("images", newImages);

                    if (form.watch("imageUrl") === currentImages[index]) {
                      form.setValue("imageUrl", newImages[0] || "");
                    }
                  }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={updateAuctionMutation.isPending}
              >
                {updateAuctionMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default AdminDashboard;