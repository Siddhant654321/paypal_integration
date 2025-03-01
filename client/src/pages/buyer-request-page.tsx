import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { BuyerRequest, Profile } from "@shared/schema";

interface BuyerRequestWithProfile extends BuyerRequest {
  buyerProfile: Profile;
}

export default function BuyerRequestPage() {
  const { id } = useParams<{ id: string }>();

  const { data: request, isLoading, error } = useQuery<BuyerRequestWithProfile>({
    queryKey: [`/api/buyer-requests/${id}`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              Failed to load buyer request
            </div>
          </CardContent>
        </Card>
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
            <div className="text-sm text-muted-foreground">
              Posted {format(new Date(request.createdAt), "MMM d, yyyy")}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-lg">{request.description}</p>

            <div className="flex items-center mt-6 pt-6 border-t">
              <Avatar className="h-10 w-10 mr-3">
                <AvatarImage src={request.buyerProfile?.profilePicture || ""} />
                <AvatarFallback>{request.buyerProfile?.fullName?.[0] || '?'}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">
                  {request.buyerProfile?.fullName || "Anonymous"}
                </div>
                <div className="text-sm text-muted-foreground">
                  Request Status: {request.status}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}