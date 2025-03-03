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

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      // Invalidate all relevant queries
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
                  Pending Sellers ({realPendingUsers.length})
                </TabsTrigger>
                <TabsTrigger value="sellers">
                  Approved Sellers ({filteredSellers.length})
                </TabsTrigger>
                <TabsTrigger value="buyers">
                  Buyers ({filteredBuyers.length})
                </TabsTrigger>
              </TabsList>

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