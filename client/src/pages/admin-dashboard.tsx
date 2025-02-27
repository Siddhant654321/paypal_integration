import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Auction } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Redirect if not an admin
  if (!user || user.role !== "admin") {
    return <Redirect to="/" />;
  }

  const { data: pendingUsers, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users/pending"],
  });

  const { data: pendingAuctions, isLoading: isLoadingAuctions } = useQuery<Auction[]>({
    queryKey: ["/api/admin/auctions"],
  });

  const approveUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/pending"] });
      toast({
        title: "Success",
        description: "User has been approved",
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
      const res = await apiRequest("POST", `/api/admin/auctions/${auctionId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
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

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Pending Sellers */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Sellers</CardTitle>
            <CardDescription>New seller accounts awaiting approval</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingUsers ? (
              <div className="flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !pendingUsers?.length ? (
              <p className="text-muted-foreground">No pending sellers</p>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <Badge variant="secondary">{user.role}</Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => approveUserMutation.mutate(user.id)}
                      disabled={approveUserMutation.isPending}
                    >
                      {approveUserMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Auctions */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Auctions</CardTitle>
            <CardDescription>New auctions awaiting approval</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAuctions ? (
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
