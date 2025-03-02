import { useQuery, useMutation } from "@tanstack/react-query";
import { type BuyerRequest, type Profile } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Clock, Edit, Trash, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface BuyerRequestWithProfile extends BuyerRequest {
  buyerProfile: Profile;
}

export function BuyerRequestList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Check if user is admin or seller-admin
  const isAdmin = user?.role === "admin" || user?.role === "seller_admin";

  const { data: requests, isLoading } = useQuery<BuyerRequestWithProfile[]>({
    queryKey: ["/api/buyer-requests", { status: "open" }], // Only fetch open requests
    refetchInterval: 5000, // Refetch every 5 seconds to keep data fresh
  });

  const deleteMutation = useMutation({
    mutationFn: async (requestId: number) => {
      await apiRequest("DELETE", `/api/buyer-requests/${requestId}`);
    },
    onSuccess: () => {
      toast({
        title: "Request Deleted",
        description: "The buyer request has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/buyer-requests'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to delete request: " + error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="space-y-2">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-3 bg-muted rounded w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="h-16 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!requests?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No open buyer requests found
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle>{request.title}</CardTitle>
                <CardDescription>
                  Looking for {request.species} - {request.category}
                </CardDescription>
              </div>
              <Badge variant={request.status === "open" ? "default" : "secondary"}>
                {request.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm line-clamp-2">{request.description}</p>

              <div className="flex items-center justify-between">
                <div className="flex items-center text-sm text-muted-foreground space-x-4">
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    <span>{request.views} views</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{format(new Date(request.createdAt), "MMM d")}</span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/buyer-requests/${request.id}/edit`)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this request?")) {
                          deleteMutation.mutate(request.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash className="h-4 w-4 mr-2" />
                      )}
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}