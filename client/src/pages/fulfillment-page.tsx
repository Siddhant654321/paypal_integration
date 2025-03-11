
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, useNavigate } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Package, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FulfillmentForm } from "@/components/fulfillment-form";
import { useState, useEffect } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { WinningBidderDetails } from "@/components/winning-bidder-details";

export default function FulfillmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [winnerDetails, setWinnerDetails] = useState<any>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchWinnerDetails = async () => {
      if (!id) return;
      
      try {
        const response = await fetch(`/api/auctions/${id}/winner`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch winner details');
        }
        
        const data = await response.json();
        setWinnerDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred while fetching winner details');
        console.error('Error fetching winner details:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchWinnerDetails();
  }, [id]);

  const handleSuccess = () => {
    // Invalidate relevant queries to refresh UI
    queryClient.invalidateQueries({ queryKey: ['seller-auctions'] });
    setTimeout(() => {
      navigate('/seller/dashboard');
    }, 3000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <LoadingSpinner className="h-12 w-12" />
        <p className="mt-4">Loading winner details...</p>
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
