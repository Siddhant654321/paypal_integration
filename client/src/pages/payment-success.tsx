
import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, Home, ArrowRight } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatPrice } from '../utils/formatters';

export default function PaymentSuccessPage() {
  const [location] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [auctionId, setAuctionId] = useState<string | null>(null);

  // Parse URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const auctionParam = params.get('auction_id');
    const paymentIntent = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');
    
    console.log('Payment success params:', { 
      sessionId, 
      auctionId: auctionParam,
      paymentIntent,
      redirectStatus 
    });
    
    if (auctionParam) {
      setAuctionId(auctionParam);
    }
    
    // Slight delay to let the system process the payment
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [location]);

  // Fetch auction data if available
  const { data: auction, isLoading: isLoadingAuction } = useQuery({
    queryKey: auctionId ? [`/api/auctions/${auctionId}`] : null,
    enabled: !!auctionId,
    staleTime: Infinity,
  });

  return (
    <div className="container max-w-lg py-12">
      <Card className="shadow-lg border-green-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            <CheckCircle className="text-green-500 h-8 w-8" />
            Payment Successful!
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {isLoading || isLoadingAuction ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Alert className="bg-green-50">
                <AlertTitle>Your payment has been processed successfully</AlertTitle>
                <AlertDescription>
                  {auction ? (
                    <span>
                      You have successfully paid for "{auction.title}".
                      {auction.currentPrice && (
                        <span className="font-medium block mt-1">
                          Amount: {formatPrice(auction.currentPrice)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>Thank you for your purchase!</span>
                  )}
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <p className="text-sm text-center">
                  A confirmation email has been sent to your registered email address.
                </p>
                <p className="text-sm text-center text-muted-foreground">
                  The seller will be notified of your payment and will arrange for shipping.
                </p>
              </div>
            </>
          )}
        </CardContent>
        
        <CardFooter className="flex flex-col space-y-2">
          <Button asChild className="w-full">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Return to Home
            </Link>
          </Button>
          
          {auctionId && (
            <Button variant="outline" asChild className="w-full">
              <Link href={`/auction/${auctionId}`}>
                View Auction Details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
