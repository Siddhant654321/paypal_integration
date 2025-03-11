import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FulfillmentForm } from "@/components/fulfillment-form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface WinnerResponse {
  auction: {
    id: number;
    title: string;
    currentPrice: number;
    status: string;
    paymentStatus: "pending" | "completed_pending_shipment" | "completed" | "failed";
  };
  profile: {
    fullName: string;
    email: string;
    phoneNumber: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

interface Props {
  auctionId: number;
  onSuccess?: () => void;
}

export function WinningBidderDetails({ auctionId, onSuccess }: Props) {
  // Fetch winning bidder details including shipping address
  const { data, isLoading, error } = useQuery<WinnerResponse>({
    queryKey: [`/api/auctions/${auctionId}/winner`],
    enabled: !!auctionId,
  });

  // Handle fulfillment submission
  const fulfillmentMutation = useMutation({
    mutationFn: async (data: { carrier: string; trackingNumber: string }) => {
      console.log("Submitting fulfillment:", { auctionId, ...data });
      return apiRequest("POST", `/api/auctions/${auctionId}/fulfill`, data);
    },
    onSuccess: () => {
      toast({
        title: "Shipping details submitted successfully",
        description: "The buyer will be notified and funds will be released to your account shortly.",
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/seller/balance'] });

      // Call the success callback if provided
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error("Error submitting fulfillment:", error);
      toast({
        title: "Error submitting shipping details",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load winner details'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No winning bidder information available</AlertDescription>
      </Alert>
    );
  }

  const { auction, profile } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Winning Bidder Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Contact Information</h3>
              <p>{profile.fullName}</p>
              <p>{profile.email}</p>
              <p>{profile.phoneNumber}</p>
            </div>

            <div>
              <h3 className="font-medium">Shipping Address</h3>
              <p>{profile.address}</p>
              <p>{profile.city}, {profile.state} {profile.zipCode}</p>
            </div>

            <div>
              <h3 className="font-medium">Payment Status</h3>
              <p className="capitalize">{auction.paymentStatus.replace(/_/g, ' ')}</p>
              {auction.paymentStatus === 'completed_pending_shipment' && (
                <p className="text-sm text-yellow-600 mt-1">
                  Please submit shipping details below to receive your payout
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {auction.paymentStatus === 'completed_pending_shipment' && (
        <Card>
          <CardHeader>
            <CardTitle>Submit Shipping Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FulfillmentForm 
              onSubmit={(data) => fulfillmentMutation.mutate(data)}
              isPending={fulfillmentMutation.isPending}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}