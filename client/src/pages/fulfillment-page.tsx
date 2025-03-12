import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FulfillmentForm } from "@/components/fulfillment-form";
import {Alert, AlertDescription} from "@/components/ui/alert"

export default function FulfillmentPage() {
  const [, params] = useRoute("/seller/fulfill/:id");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get winner details
  const { data: winnerDetails, isLoading } = useQuery({
    queryKey: [`/api/auctions/${params?.id}/winner`],
    enabled: !!params?.id,
  });

  // Get fulfillment status
  const { data: fulfillment } = useQuery({
    queryKey: [`/api/auctions/${params?.id}/fulfillment`],
    enabled: !!params?.id,
  });

  // Submit fulfillment mutation
  const fulfillMutation = useMutation({
    mutationFn: async (data: { carrier: string; trackingNumber: string; notes?: string }) => {
      try {
        console.log("[FULFILLMENT] Submitting data:", data);

        // Log the data to see what's being sent
        console.log("[FULFILLMENT] Form data:", {
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          notes: data.notes || ""
        });

        console.log("[FULFILLMENT] Data received from form:", data);

        // Ensure field names match what the server expects
        const payload = {
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          notes: data.notes || "",
          shippingDate: new Date().toISOString()
        };

        console.log("[FULFILLMENT] Sending payload to server:", payload);

        const response = await fetch(`/api/auctions/${params?.id}/fulfill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'include' // Include credentials for auth
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Fulfillment error response:", errorData);
          throw new Error(errorData.message || 'Failed to submit fulfillment');
        }

        const result = await response.json();
        console.log("Fulfillment success response:", result);
        return result;
      } catch (error) {
        console.error("Fulfillment submission error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Fulfillment Submitted",
        description: "Shipping details have been sent to the buyer",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/auctions/${params?.id}/fulfillment`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!winnerDetails) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">
          Winner details not found or you don't have permission to view them.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 px-4 md:py-8 md:px-8">
      <Link href="/seller/dashboard">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </Link>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Winner Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Auction</h3>
                <p className="text-muted-foreground">{winnerDetails.auction.title}</p>
              </div>

              <div>
                <h3 className="font-medium">Winner Information</h3>
                <div className="space-y-2">
                  <p>Name: {winnerDetails.profile.fullName}</p>
                  <p>Email: {winnerDetails.profile.email}</p>
                  <p>Address: {winnerDetails.profile.shippingAddress}</p>
                  {winnerDetails.profile.phoneNumber && (
                    <p>Phone: {winnerDetails.profile.phoneNumber}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {(!fulfillment?.status || fulfillment.status === "pending" || !fulfillment) ? (
          <Card>
            <CardHeader>
              <CardTitle>Shipping Details</CardTitle>
            </CardHeader>
            <CardContent>
              <FulfillmentForm 
                onSubmit={(data) => fulfillMutation.mutate(data)}
                isPending={fulfillMutation.isPending}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Already Fulfilled</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>
                  This auction has already been fulfilled.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}