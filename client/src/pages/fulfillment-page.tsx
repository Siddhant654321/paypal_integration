import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FulfillmentForm } from "@/components/fulfillment-form";

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
    mutationFn: async (formData) => {
      const response = await fetch(`/api/auctions/${params?.id}/fulfill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          auctionId: parseInt(params?.id || '0'),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit fulfillment');
      }

      return response.json();
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
    <div className="container mx-auto py-8">
      <Link href="/seller/dashboard">
        <Button variant="ghost" className="mb-6">
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

        {!fulfillment?.status || fulfillment.status === "pending" ? (
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
              <CardTitle>Fulfillment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p>Status: {fulfillment.status}</p>
                <p>Shipping Carrier: {fulfillment.shippingCarrier}</p>
                <p>Tracking Number: {fulfillment.trackingNumber}</p>
                <p>Shipping Date: {new Date(fulfillment.shippingDate).toLocaleDateString()}</p>
                {fulfillment.estimatedDeliveryDate && (
                  <p>Estimated Delivery: {new Date(fulfillment.estimatedDeliveryDate).toLocaleDateString()}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { WinningBidderDetails } from '@/components/winning-bidder-details';
import { FulfillmentForm } from '@/components/fulfillment-form';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function FulfillmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [winnerDetails, setWinnerDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWinnerDetails() {
      try {
        setLoading(true);
        const response = await fetch(`/api/auctions/${id}/winner`);
        
        if (!response.ok) {
          throw new Error(`Failed to load winner details: ${response.status}`);
        }
        
        const data = await response.json();
        setWinnerDetails(data);
      } catch (err) {
        console.error('Error fetching winner details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load winner details');
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load winner details. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchWinnerDetails();
    }
  }, [id, toast]);

  const handleSuccess = () => {
    toast({
      title: 'Tracking Information Submitted',
      description: 'The buyer has been notified and your payout is being processed.',
    });
    navigate('/seller/dashboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <LoadingSpinner className="w-12 h-12" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-3xl mt-8">
        <CardHeader>
          <CardTitle>Error Loading Information</CardTitle>
          <CardDescription>
            We couldn't load the winner details for this auction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
        <CardFooter>
          <Button onClick={() => navigate('/seller/dashboard')}>Return to Dashboard</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="container py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Submit Fulfillment Details</h1>
      
      {winnerDetails && (
        <>
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Shipping Information</CardTitle>
              <CardDescription>
                The buyer has completed payment and is waiting for their item to be shipped.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WinningBidderDetails data={winnerDetails} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submit Tracking Information</CardTitle>
              <CardDescription>
                Enter the carrier and tracking number to release your payout
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FulfillmentForm auctionId={parseInt(id!)} onSuccess={handleSuccess} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
