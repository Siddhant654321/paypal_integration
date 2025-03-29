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
    paymentStatus:
      | "pending"
      | "completed_pending_shipment"
      | "completed"
      | "failed";
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

  // Fetch current payment status
  const { data: paymentStatusData, refetch } = useQuery({
    queryKey: [`/api/auctions/${auctionId}/payment-status`],
    enabled: !!auctionId,
    refetchInterval: 5000, // Poll every 5 seconds
    onSuccess: (data) => {
      console.log("[PAYMENT] Status updated:", {
        status: data?.status,
        auctionId,
        timestamp: new Date().toISOString(),
      });
    },
  });

  // Handle fulfillment submission
  const fulfillmentMutation = useMutation({
    mutationFn: async (data: {
      carrier: string;
      trackingNumber: string;
      notes?: string;
    }) => {
      console.log("[FULFILLMENT] Submitting:", { auctionId, ...data });
      const trackingInfo = `${data.carrier}: ${data.trackingNumber}${data.notes ? ` (${data.notes})` : ""}`;
      return apiRequest("POST", `/api/auctions/${auctionId}/fulfill`, {
        trackingInfo,
      });
    },
    onSuccess: () => {
      toast({
        title: "Shipping details submitted successfully",
        description:
          "The buyer will be notified and funds will be released to your account shortly.",
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: [`/api/auctions/${auctionId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/balance"] });
      console.log(
        "[FULFILLMENT] Successful, payment status should update soon",
      );
      refetch(); // Refetch payment status after fulfillment

      // Call the success callback if provided
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error("[FULFILLMENT] Error:", error);
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
          {error instanceof Error
            ? error.message
            : "Failed to load winner details"}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No winning bidder information available
        </AlertDescription>
      </Alert>
    );
  }

  const { auction, profile } = data;
  const currentPaymentStatus =
    paymentStatusData?.status || auction.paymentStatus;

  // Log when the component renders and the payment status
  console.log("[PAYMENT] Rendering WinningBidderDetails:", {
    auctionId,
    originalPaymentStatus: auction.paymentStatus,
    currentPaymentStatus,
    shouldShowForm: currentPaymentStatus === "completed_pending_shipment",
  });

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
              <p>
                {profile.city}, {profile.state} {profile.zipCode}
              </p>
            </div>

            <div>
              <h3 className="font-medium">Payment Status</h3>
              <p className="capitalize">
                {currentPaymentStatus.replace(/_/g, " ")}
              </p>
              {currentPaymentStatus === "completed_pending_shipment" && (
                <p className="text-sm text-yellow-600 mt-1">
                  Please submit shipping details below to receive your payout
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {(currentPaymentStatus === "completed_pending_shipment" ||
        (currentPaymentStatus === "pending" &&
          auction?.status === "ended")) && (
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
