import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FulfillmentForm } from "@/components/fulfillment-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface WinnerDetails {
  fullName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  paymentStatus: "pending" | "completed_pending_shipment" | "completed" | "failed";
}

interface Props {
  auctionId: number;
  onSuccess?: () => void;
}

export function WinningBidderDetails({ auctionId, onSuccess }: Props) {
  // Fetch winning bidder details including shipping address
  const { data: bidderDetails, isLoading } = useQuery<WinnerDetails>({
    queryKey: [`/api/auctions/${auctionId}/winner`],
    enabled: !!auctionId,
  });

  // Handle fulfillment submission
  const fulfillmentMutation = useMutation({
    mutationFn: async (data: { trackingNumber: string; carrier: string }) => {
      return apiRequest("POST", `/api/auctions/${auctionId}/fulfill`, data);
    },
    onSuccess: () => {
      toast({
        title: "Shipping details submitted",
        description: "The buyer will be notified and funds will be released to your account.",
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${auctionId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/seller/balance'] });

      // Call the success callback if provided
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error submitting shipping details",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <Skeleton className="w-full h-48" />;
  }

  if (!bidderDetails) {
    return <div>No winning bidder information available</div>;
  }

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
              <p>{bidderDetails.fullName}</p>
              <p>{bidderDetails.email}</p>
              <p>{bidderDetails.phoneNumber}</p>
            </div>

            <div>
              <h3 className="font-medium">Shipping Address</h3>
              <p>{bidderDetails.address}</p>
              <p>{bidderDetails.city}, {bidderDetails.state} {bidderDetails.zipCode}</p>
            </div>

            <div>
              <h3 className="font-medium">Payment Status</h3>
              <p className="capitalize">
                {bidderDetails.paymentStatus.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {bidderDetails.paymentStatus === 'completed_pending_shipment' && (
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