import { Auction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import EditAuctionDialog from "@/components/edit-auction-dialog";

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
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);

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
      return await apiRequest("POST", `/api/admin/auctions/${auctionId}/approve`);
    },
    onSuccess: () => {
      console.log("Successfully approved auction");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction has been approved"
      });
    },
    onError: (error: any) => {
      console.error("Error approving auction:", error);
      toast({
        title: "Error",
        description: "Failed to approve auction: " + error.message,
        variant: "destructive"
      });
    }
  });

  const closeEditDialog = () => {
    setSelectedAuction(null);
  };

  const handleEditAuction = (auction: Auction) => {
    console.log("[AdminDashboard] Opening edit dialog for auction:", auction.id);
    setSelectedAuction(auction);
  };

  // Filter auctions based on search term
  const filteredActiveAuctions = approvedAuctions?.filter(auction => 
    auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
    auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
    auction.species.toLowerCase().includes(auctionSearchTerm.toLowerCase())
  ) || [];

  const filteredPendingAuctions = pendingAuctions?.filter(auction => !auction.approved) || [];

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      {/* Tabs for Users and Auctions management */}
      <Tabs defaultValue="auctions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="auctions">Auctions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="auctions">
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
                </TabsList>

                <TabsContent value="pending">
                  {isLoadingPendingAuctions ? (
                    <div className="flex justify-center">
                      <LoadingSpinner className="h-8 w-8" />
                    </div>
                  ) : !filteredPendingAuctions.length ? (
                    <p className="text-muted-foreground">No pending auctions</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredPendingAuctions.map((auction) => (
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
                            </div>
                          }
                        />
                      ))}
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
                        <LoadingSpinner className="h-8 w-8" />
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
                              </div>
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
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Manage user accounts</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Add your existing users management UI here */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedAuction && (
        <EditAuctionDialog
          auction={selectedAuction}
          onClose={closeEditDialog}
        />
      )}
    </div>
  );
}

export default AdminDashboard;