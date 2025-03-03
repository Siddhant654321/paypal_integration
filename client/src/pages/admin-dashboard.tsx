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
import { LoadingSpinner } from "@/components/ui/loading-spinner"; //Corrected import path

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

type Bid = {
  id: number;
  auctionId: number;
  bidderId: number;
  amount: number;
  timestamp: string;
  status: string;
};

// ViewBidsDialog Component
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
        <Button variant="outline" size="sm">View Bids</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bids for {auctionTitle}</DialogTitle>
          <DialogDescription>
            View and manage bids for this auction
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !bids?.length ? (
          <p className="text-muted-foreground text-center py-4">No bids found</p>
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => (
              <div key={bid.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">Bid Amount: ${bid.amount}</p>
                  <p className="text-sm text-muted-foreground">
                    Bidder ID: {bid.bidderId}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(bid.timestamp).toLocaleString()}
                  </p>
                </div>
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
                        onClick={() => deleteBidMutation.mutate(bid.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// UserProfileDialog Component
function UserProfileDialog({ userId, username, role, onClose }: { userId: number; username: string; role: string; onClose: () => void }) {
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

// AdminDashboard Component
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

  const { data: pendingAuctions, isLoading: isLoadingPendingAuctions } = useQuery({
    queryKey: ["/api/admin/auctions", { approved: false }],
    queryFn: () => fetch('/api/admin/auctions?approved=false').then(res => {
      if (!res.ok) throw new Error("Failed to fetch pending auctions");
      return res.json();
    })
  });

  const { data: approvedAuctions, isLoading: isLoadingApprovedAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/auctions", { approved: true }],
  });

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

  // Memoized filters
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

  const filteredBuyers = buyers?.filter((buyer) =>
    buyer.username.toLowerCase().includes(buyerSearchTerm.toLowerCase()) ||
    buyer.email?.toLowerCase().includes(buyerSearchTerm.toLowerCase())
  );

  const filteredSellers = approvedSellers?.filter((seller) =>
    (seller.role === "seller" || seller.role === "seller_admin") &&
    seller.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const realPendingUsers = pendingUsers?.filter((user) => user.role === "seller" && !user.approved);

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
                                      Are yousure you want to delete this seller's profile? This action cannot be undone.
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
                  ) : !filteredBuyers?.length ? (
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
                    <Loader2 className="h-8 w-8 animate-spin" />
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
                            <Button
                              size="sm"
                              onClick={() => approveAuctionMutation.mutate(auction.id)}
                              disabled={
                                approveAuctionMutation.isPending ||
                                !isStripeVerified
                              }
                              variant="default"
                            >
                              {approveAuctionMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approve
                            </Button>

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
                  ) : !filteredActiveAuctions?.length ? (
                    <p className="text-muted-foreground">No active auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredActiveAuctions.map((auction) => (
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
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : !filteredCompletedAuctions?.length ? (
                    <p className="text-muted-foreground">No completed auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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