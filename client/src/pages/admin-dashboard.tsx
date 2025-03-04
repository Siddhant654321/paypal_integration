import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, Search, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Auction } from "@shared/schema";
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
import AuctionCard from "@/components/auction-card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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
    queryKey: ["/api/admin/auctions", "pending"],
    queryFn: () => apiRequest("GET", "/api/admin/auctions?approved=false"),
  });

  const { data: approvedAuctions, isLoading: isLoadingApprovedAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/admin/auctions", "approved"],
    queryFn: () => apiRequest("GET", "/api/admin/auctions?approved=true"),
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions", "approved"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions", "approved"] });
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

                      return (
                        <div
                          key={auction.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex-grow">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{auction.title}</p>
                              {!isStripeVerified && (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                                  <AlertCircle className="h-4 w-4 mr-1" />
                                  Stripe setup incomplete
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-2 mt-1">
                              <Badge>{auction.species}</Badge>
                              <Badge variant="outline">{auction.category}</Badge>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              <p>
                                <span className="font-semibold">Seller: </span>
                                {seller ? seller.username : "Unknown"}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  disabled={approveAuctionMutation.isPending}
                                  variant="default"
                                >
                                  {approveAuctionMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  )}
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Approve
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {isStripeVerified ? 'Approve Auction' : 'Warning: Stripe Not Verified'}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {isStripeVerified
                                      ? 'Are you sure you want to approve this auction?'
                                      : "The seller's Stripe account is not verified. Approving this auction may cause payment issues later. Do you want to proceed anyway?"}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => approveAuctionMutation.mutate(auction.id)}
                                  >
                                    Approve
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

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
  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["/api/admin/profiles", userId],
    queryFn: () => fetch(`/api/admin/profiles/${userId}`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    }),
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AdminDashboard;