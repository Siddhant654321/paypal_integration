import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Search, Trash2, Edit } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { User, Auction, insertAuctionSchema, type Bid } from "@shared/schema";
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

// Update the ViewBidsDialog component
function ViewBidsDialog({ auctionId, auctionTitle }: { auctionId: number; auctionTitle: string }) {
  const { toast } = useToast();

  const { data: bids, isLoading } = useQuery<Bid[]>({
    queryKey: ["/api/admin/bids", auctionId],
    queryFn: () => 
      fetch(`/api/admin/bids?auctionId=${auctionId}`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch bids');
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
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !bids?.length ? (
          <p className="text-muted-foreground text-center py-4">No bids found</p>
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => (
              <div
                key={bid.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
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

// Keep EditAuctionDialog component the same...

function EditAuctionDialog({ auction }: { auction: Auction }) {
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: auction.title,
      description: auction.description,
      species: auction.species,
      category: auction.category,
      startPrice: auction.startPrice,
      reservePrice: auction.reservePrice,
      startDate: new Date(auction.startDate).toISOString(),
      endDate: new Date(auction.endDate).toISOString(),
      imageUrl: auction.imageUrl || "",
      images: auction.images,
    },
  });

  const updateAuctionMutation = useMutation({
    mutationFn: async (formData: typeof form.getValues) => {
      const data = {
        ...formData,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
      };
      const res = await apiRequest("PATCH", `/api/admin/auctions/${auction.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction has been updated",
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
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Auction</DialogTitle>
          <DialogDescription>
            Make changes to the auction details below.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateAuctionMutation.mutate(data))} className="space-y-4">
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
                    <FormControl>
                      <select {...field} className="form-select block w-full">
                        <option value="show">Show Quality</option>
                        <option value="purebred">Purebred & Production</option>
                        <option value="fun">Fun & Mixed</option>
                      </select>
                    </FormControl>
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
                    <FormLabel>Start Price</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} value={field.value} onChange={(e) => field.onChange(parseInt(e.target.value, 10))} />
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
                      <Input type="number" {...field} value={field.value} onChange={(e) => field.onChange(parseInt(e.target.value, 10))} />
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
                      <Input type="datetime-local" {...field} />
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
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={updateAuctionMutation.isPending}>
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

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [auctionSearchTerm, setAuctionSearchTerm] = useState("");

  // Redirect if not an admin
  if (!user || (user.role !== "admin" && user.role !== "seller_admin")) {
    return <Redirect to="/" />;
  }

  const { data: pendingUsers, isLoading: isLoadingPending } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { approved: false, role: "seller" }],
  });

  const { data: approvedSellers, isLoading: isLoadingApproved } = useQuery<User[]>({
    queryKey: ["/api/admin/users", { approved: true, role: "seller" }],
  });

  const { data: pendingAuctions, isLoading: isLoadingPendingAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/admin/auctions"],
  });

  const { data: approvedAuctions, isLoading: isLoadingApprovedAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/auctions", { approved: true }],
  });


  const approveAuctionMutation = useMutation({
    mutationFn: async (auctionId: number) => {
      await apiRequest("PATCH", `/api/admin/auctions/${auctionId}`, { approved: true });
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

  // Filter approved sellers for the approved tab
  const filteredSellers = approvedSellers?.filter(seller =>
    seller.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Make sure pendingUsers only contains sellers that are not approved
  const realPendingUsers = pendingUsers?.filter(user => 
    user.role === "seller" && !user.approved
  );

  const filteredApprovedAuctions = approvedAuctions?.filter(auction =>
    auction.title.toLowerCase().includes(auctionSearchTerm.toLowerCase()) ||
    auction.description.toLowerCase().includes(auctionSearchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Sellers</CardTitle>
            <CardDescription>Manage seller accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending">
              <TabsList className="w-full">
                <TabsTrigger value="pending">
                  Pending Approval ({pendingUsers?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="approved">
                  Approved Sellers ({approvedSellers?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                {isLoadingPending ? (
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                          <p className="font-medium">{user.username}</p>
                          <Badge variant="secondary">{user.role}</Badge>
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

              <TabsContent value="approved">
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
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                            <p className="font-medium">{seller.username}</p>
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
                  Pending Approval ({pendingAuctions?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="approved">
                  Approved Auctions ({approvedAuctions?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                {isLoadingPendingAuctions ? (
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !pendingAuctions?.length ? (
                  <p className="text-muted-foreground">No pending auctions</p>
                ) : (
                  <div className="space-y-4">
                    {pendingAuctions.map((auction) => (
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
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => approveAuctionMutation.mutate(auction.id)}
                            disabled={approveAuctionMutation.isPending}
                          >
                            {approveAuctionMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
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
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="approved">
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
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !filteredApprovedAuctions?.length ? (
                    <p className="text-muted-foreground">No auctions found</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredApprovedAuctions.map((auction) => (
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
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}