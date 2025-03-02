import { useQuery } from "@tanstack/react-query";
import { type BuyerRequest, type Profile } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Clock } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface BuyerRequestWithProfile extends BuyerRequest {
  buyerProfile: Profile;
}

export function BuyerRequestList() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useQuery<BuyerRequestWithProfile[]>({
    queryKey: ["/api/buyer-requests", { status: "open" }], // Only fetch open requests
    refetchInterval: 5000, // Refetch every 5 seconds to keep data fresh
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
        <Link key={request.id} href={`/buyer-requests/${request.id}`}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
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

                <div className="flex items-center justify-end text-sm text-muted-foreground">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      <span>{request.views} views</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{format(new Date(request.createdAt), "MMM d")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}