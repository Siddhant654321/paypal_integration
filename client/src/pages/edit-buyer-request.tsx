import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { BuyerRequest } from "@shared/schema";
import { BuyerRequestForm } from "@/components/buyer-request-form";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function EditBuyerRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: request, isLoading, error } = useQuery<BuyerRequest>({
    queryKey: [`/api/buyer-requests/${id}`],
    enabled: !!id,
  });

  // Check if user is admin or seller-admin
  if (!user?.role?.includes("admin")) {
    toast({
      title: "Access Denied",
      description: "Only administrators can edit buyer requests.",
      variant: "destructive",
    });
    navigate("/");
    return null;
  }

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
              {error ? "Error loading request" : "Request not found"}
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
          <CardTitle>Edit Buyer Request</CardTitle>
        </CardHeader>
        <CardContent>
          <BuyerRequestForm initialData={request} isEditing />
        </CardContent>
      </Card>
    </div>
  );
}