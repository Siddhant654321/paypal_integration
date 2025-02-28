
import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Auction } from "@/shared/schema";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CardHeader, CardContent, Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function PaymentPage() {
  const [, params] = useRoute<{ id: string }>("/auction/:id/pay");
  const auctionId = params?.id;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [paymentData, setPaymentData] = useState<{ clientSecret: string } | null>(null);
  const [includeInsurance, setIncludeInsurance] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const paymentElementRef = useRef<HTMLDivElement>(null);
  
  const { data: auction, isLoading } = useQuery<Auction>({
    queryKey: ['auction', auctionId],
    queryFn: async () => {
      const res = await fetch(`/api/auctions/${auctionId}`);
      if (!res.ok) throw new Error('Failed to fetch auction');
      return res.json();
    },
    enabled: !!auctionId,
  });
  
  const insuranceAmountDollars = auction ? (auction.currentBid * 0.05).toFixed(2) : "0.00";
  const totalAmountDollars = auction 
    ? (auction.currentBid + (includeInsurance ? auction.currentBid * 0.05 : 0)).toFixed(2) 
    : "0.00";
  
  useEffect(() => {
    if (!auction) return;
    
    // Create payment intent
    const createPaymentIntent = async () => {
      try {
        const response = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            auctionId, 
            amount: auction.currentBid,
            includeInsurance
          }),
        });
        
        if (!response.ok) throw new Error('Payment setup failed');
        
        const data = await response.json();
        setPaymentData(data);
      } catch (error) {
        console.error('Payment intent creation failed:', error);
      }
    };
    
    createPaymentIntent();
  }, [auction, auctionId, includeInsurance]);
  
  useEffect(() => {
    if (!paymentData?.clientSecret) return;

    const loadStripe = async () => {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
      
      if (!stripe) {
        console.error("Failed to load Stripe");
        return;
      }
      
      stripeRef.current = stripe;
      console.log("Stripe loaded successfully");
      
      console.log("Creating Elements instance...");
      const elements = stripe.elements({
        clientSecret: paymentData.clientSecret,
        appearance: { theme: 'stripe' }
      });
      
      // Create and mount the Payment Element
      const paymentElement = elements.create('payment');
      if (paymentElementRef.current) {
        paymentElement.mount(paymentElementRef.current);
        elementsRef.current = elements;
        setStripeReady(true);
      }
    };
    
    loadStripe();
  }, [paymentData]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripeRef.current || !elementsRef.current) {
      console.error("Stripe not initialized");
      return;
    }
    
    setIsSubmitting(true);
    
    const { error } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: {
        return_url: `${window.location.origin}/buyer/dashboard`,
      },
    });
    
    if (error) {
      console.error("Payment confirmation error:", error);
      setIsSubmitting(false);
    } else {
      setIsSuccess(true);
    }
  };
  
  if (isLoading) {
    return (
      <div className="container mx-auto py-10 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  if (!auction) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold mb-4">Auction not found</h1>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6">Complete Your Purchase</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Payment Details</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div 
                  ref={paymentElementRef} 
                  className="min-h-[200px] bg-card border rounded-md p-4 flex items-center justify-center"
                >
                  {!stripeReady && (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Loading payment form...</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="insurance-switch"
                    checked={includeInsurance}
                    onCheckedChange={setIncludeInsurance}
                  />
                  <Label htmlFor="insurance-switch" className="flex items-center space-x-2">
                    <Shield className="h-4 w-4" />
                    <span>Add insurance (${insuranceAmountDollars})</span>
                  </Label>
                </div>
                
                <Button 
                  type="submit"
                  disabled={!stripeReady || isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Pay ${totalAmountDollars}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Order Summary</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span>Total</span>
                    <span className="font-semibold">${auction.currentBid.toFixed(2)}</span>
                  </div>
                  
                  {includeInsurance && (
                    <div className="flex justify-between mb-2">
                      <span>Insurance</span>
                      <span className="font-semibold">${insuranceAmountDollars}</span>
                    </div>
                  )}
                  
                  <div className="border-t pt-2 mt-2 flex justify-between">
                    <span className="font-bold">Total</span>
                    <span className="font-bold">${totalAmountDollars}</span>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Item Details</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Item</span>
                      <span>{auction.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your Bid</span>
                      <span>${auction.currentBid.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
