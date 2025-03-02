import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash, Edit } from "lucide-react";
import { format } from "date-fns";
import { BuyerRequest, Profile } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BuyerRequestWithProfile extends BuyerRequest {
  buyerProfile?: Profile;
}

export default function BuyerRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: request, isLoading } = useQuery<BuyerRequestWithProfile>({
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
        description: "The buyer request has been deleted successfully.",
      });
      navigate("/buyer-requests");
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
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              Request not found
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = user?.role?.includes("admin");

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
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Posted {format(new Date(request.createdAt), "MMM d, yyyy")}
              </div>
              <Badge variant={request.status === "open" ? "default" : "secondary"}>
                {request.status}
              </Badge>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/buyer-requests/${id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this request?")) {
                    deleteMutation.mutate();
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
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-lg">{request.description}</p>
            {request.buyerProfile && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-medium mb-2">Buyer Information</h3>
                <p>{request.buyerProfile.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {request.buyerProfile.city}, {request.buyerProfile.state}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}