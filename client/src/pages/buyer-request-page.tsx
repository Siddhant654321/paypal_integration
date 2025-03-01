import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { BuyerRequest, Profile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BuyerRequestWithProfile extends BuyerRequest {
  buyerProfile: Profile;
}

export default function BuyerRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: request, isLoading, error } = useQuery<BuyerRequestWithProfile>({
    queryKey: [`/api/buyer-requests/${id}`],
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/buyer-requests/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Request Deleted",
        description: "The request has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/buyer-requests"] });
      navigate("/");
    },
  });

  const handleFulfill = () => {
    navigate(`/seller/new-auction?fulfill=${id}`);
  };

  // Check if user is an approved seller or seller_admin
  const canFulfillRequest = user && (
    (user.role === "seller" && user.approved) ||
    user.role === "seller_admin"
  );

  console.log("User role and approval status:", {
    userRole: user?.role,
    isApproved: user?.approved,
    canFulfillRequest,
    isAdmin: user?.role === "admin" || user?.role === "seller_admin"
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              {error ? "Failed to load buyer request" : "Request not found"}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{request.title}</CardTitle>
              <div className="text-sm text-muted-foreground mt-2">
                {request.category} - {request.species}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canFulfillRequest && request.status === "open" && (
                <Button onClick={handleFulfill}>
                  Fulfill Request
                </Button>
              )}
              {(user?.role === "admin" || user?.role === "seller_admin") && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-lg">{request.description}</p>
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>Posted {format(new Date(request.createdAt), "MMM d, yyyy")}</span>
              <span>Status: {request.status}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}