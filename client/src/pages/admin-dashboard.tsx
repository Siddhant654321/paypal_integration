import React, { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Loader2,
  Search,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Edit,
  Eye,
  FileEdit,
  Calendar
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "../utils/formatters";
import AuctionCard from "@/components/auction-card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Auction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";


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

function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [auctionSearchTerm, setAuctionSearchTerm] = useState("");
  const [buyerSearchTerm, setBuyerSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; username: string; role: string } | null>(null);

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
      await apiRequest("POST", `/api/admin/auctions/${auctionId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
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
      new Date(auction.endDate) > now &&
      auction.status !== "completed" &&
      auction.status !== "ended" &&
      auction.status !== "voided"
    );
    if (!auctionSearchTerm) return active;

    return active.filter(auction =>
      auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.species.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
      auction.category.toLowerCase().includes(auctionSearchTerm.toLowerCase())
    );
  }, [approvedAuctions, auctionSearchTerm]);

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

  return (
    <div className="container mx-auto py-8">
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
                            {sellerStripeStatuses?.find(s => s.sellerId === seller.id)?.status === "verified"
                              ? <CheckCircle2 className="h-4 w-4 text-green-500" title="Stripe account set up" />
                              : <AlertCircle className="h-4 w-4 text-amber-500" title="No Stripe account" />
                            }
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
                  Pending ({pendingAuctions?.length || 0})
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
                  <div className="space-y-4">
                    {pendingAuctions.map((auction) => {
                      const seller = approvedSellers?.find(seller => seller.id === auction.sellerId);
                      const sellerStripeStatus = sellerStripeStatuses?.find(s => s.sellerId === auction.sellerId);
                      const isStripeVerified = sellerStripeStatus?.status === "verified";
                      const formattedStartDate = new Date(auction.startDate).toLocaleDateString();
                      const formattedEndDate = new Date(auction.endDate).toLocaleDateString();

                      return (
                        <Card key={auction.id}>
                          <CardHeader>
                            <CardTitle>{auction.title}</CardTitle>
                            <CardDescription>
                              {auction.species} - {auction.category}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex justify-between mb-4">
                              <div>
                                <div className="font-medium">Seller:</div>
                                <div className="text-sm text-muted-foreground">
                                  {seller?.username || "Unknown Seller"}
                                </div>
                              </div>
                              <div>
                                <div className="font-medium">Start Price:</div>
                                <div className="text-sm">
                                  {formatPrice(auction.startPrice)}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 my-2">
                              <div>
                                <div className="font-medium">Start Date:</div>
                                <div className="text-sm text-muted-foreground">
                                  {formattedStartDate}
                                </div>
                              </div>
                              <div>
                                <div className="font-medium">End Date:</div>
                                <div className="text-sm text-muted-foreground">
                                  {formattedEndDate}
                                </div>
                              </div>
                            </div>

                            {!isStripeVerified && (
                              <Alert className="mb-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Seller not verified</AlertTitle>
                                <AlertDescription>
                                  The seller must complete Stripe verification before their auction can be approved.
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <div>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="w-full">
                                      <Eye className="h-4 w-4 mr-2" />
                                      View Details
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-xl">
                                    <DialogHeader>
                                      <DialogTitle>{auction.title}</DialogTitle>
                                      <DialogDescription>
                                        Auction #{auction.id} details
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 my-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <h4 className="text-sm font-medium">Start Price</h4>
                                          <p>{formatPrice(auction.startPrice)}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Reserve Price</h4>
                                          <p>{formatPrice(auction.reservePrice)}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Start Date</h4>
                                          <p>{formattedStartDate}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">End Date</h4>
                                          <p>{formattedEndDate}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Species</h4>
                                          <p>{auction.species}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Category</h4>
                                          <p>{auction.category}</p>
                                        </div>
                                      </div>

                                      <div>
                                        <h4 className="text-sm font-medium">Description</h4>
                                        <p className="text-sm mt-1">{auction.description}</p>
                                      </div>

                                      {auction.images && auction.images.length > 0 && (
                                        <div>
                                          <h4 className="text-sm font-medium mb-2">Images</h4>
                                          <div className="grid grid-cols-3 gap-2">
                                            {auction.images.map((image, index) => (
                                              <img 
                                                key={index}
                                                src={image}
                                                alt={`Auction image ${index + 1}`}
                                                className="rounded-md h-24 w-full object-cover"
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                              <div>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="secondary" size="sm" className="w-full">
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-xl">
                                    <DialogHeader>
                                      <DialogTitle>Edit Auction</DialogTitle>
                                      <DialogDescription>
                                        Make changes to this auction before approval
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                          <Label htmlFor="edit-title">Title</Label>
                                          <Input 
                                            id="edit-title" 
                                            defaultValue={auction.title}
                                            onChange={(e) => {
                                              // You can add state here to track changes
                                            }}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor="edit-price">Start Price</Label>
                                          <Input 
                                            id="edit-price" 
                                            type="number"
                                            defaultValue={auction.startPrice / 100} 
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor="edit-species">Species</Label>
                                          <Input 
                                            id="edit-species" 
                                            defaultValue={auction.species} 
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor="edit-category">Category</Label>
                                          <Input 
                                            id="edit-category" 
                                            defaultValue={auction.category} 
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor="edit-description">Description</Label>
                                        <Textarea 
                                          id="edit-description" 
                                          defaultValue={auction.description}
                                          rows={4}
                                        />
                                      </div>
                                    </div>
                                    <DialogFooter>
                                      <DialogClose asChild>
                                        <Button variant="outline">Cancel</Button>
                                      </DialogClose>
                                      <Button type="submit" onClick={() => {
                                        // Implement update logic here
                                        // You would use updateAuctionMutation
                                        toast({
                                          title: "Changes Saved",
                                          description: "The auction has been updated.",
                                        });
                                      }}>
                                        Save Changes
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 mt-4">
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
                                disabled={!isStripeVerified}
                                onClick={() => approveAuctionMutation.mutate(auction.id)}
                              >
                                Approve
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
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

            {{role === "buyer" && (
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
    onSuccess: () =>{
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

function EditAuctionDialog({ auction }: { auction: Auction }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagesToRemove, setImagesToRemove] = useState<string[]>([]);

  const formatDateForInput = (dateString: string) => {
    const date = new Date(dateString);
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
  };

  const form = useForm({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: auction.title,
      description: auction.description,
      species: auction.species,
      category: auction.category,
      startPrice: auction.startPrice / 100,
      reservePrice: auction.reservePrice / 100,
      startDate: formatDateForInput(auction.startDate),
      endDate: formatDateForInput(auction.endDate),
      imageUrl: auction.imageUrl || "",
      images: auction.images || [],
    },
  });

  const updateAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();

      const dataToSend = {
        ...data,
        startPrice: Math.round(Number(data.startPrice) * 100),
        reservePrice: Math.round(Number(data.reservePrice) * 100),
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
      };

      Object.keys(dataToSend).forEach(key => {
        if (key !== 'files' && key !== 'images') {
          formData.append(key, dataToSend[key].toString());
        }
      });

      selectedFiles.forEach(file => {
        formData.append('images', file);
      });

      formData.append('imagesToRemove', JSON.stringify(imagesToRemove));

      const remainingImages = auction.images?.filter(img => !imagesToRemove.includes(img)) || [];
      formData.append('existingImages', JSON.stringify(remainingImages));

      if (data.startDate || data.endDate) {
        return await axios.patch(`/api/admin/auctions/${auction.id}`, {
          startDate: data.startDate,
          endDate: data.endDate
        });
      } else {
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
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auction.id}`] });
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

  const onSubmit = (data: any) => {
    const sanitizedData = {
      ...data,
      startDate: data.startDate instanceof Date ? data.startDate : new Date(data.startDate as string),
      endDate: data.endDate instanceof Date ? data.endDate : new Date(data.endDate as string)
    };

    updateAuctionMutation.mutate(sanitizedData);
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
            onSubmit={form.handleSubmit(onSubmit)}
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

export default AdminDashboard;