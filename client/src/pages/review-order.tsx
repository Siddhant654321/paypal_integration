
import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { Card } from '../components/ui/card';

export default function ReviewOrderPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');
  const auctionId = params.get('auctionId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [auction, setAuction] = useState<any>(null);

  useEffect(() => {
    if (!orderId || !auctionId) {
      setError('Missing order information');
      setLoading(false);
      return;
    }

    loadData();
  }, [orderId, auctionId]);

  const loadData = async () => {
    try {
      // Load both order and auction details
      const [orderResponse, auctionResponse] = await Promise.all([
        fetch(`/api/payment/${orderId}`),
        fetch(`/api/auctions/${auctionId}`)
      ]);

      if (!orderResponse.ok || !auctionResponse.ok) {
        throw new Error('Failed to load order details');
      }

      const [orderData, auctionData] = await Promise.all([
        orderResponse.json(),
        auctionResponse.json()
      ]);

      setOrderDetails(orderData);
      setAuction(auctionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/auctions/${auctionId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId })
      });

      if (!response.ok) {
        throw new Error('Failed to approve order');
      }

      // Redirect to capture page
      setLocation(`/payment/capture?orderId=${orderId}&auctionId=${auctionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve order');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen"><LoadingSpinner /></div>;
  }

  if (error) {
    return <div className="text-red-500 text-center p-4">{error}</div>;
  }

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-6">Review Your Order</h1>
        {orderDetails && auction && (
          <div className="space-y-4">
            <div className="mb-4">
              <h2 className="text-xl mb-2">{auction.title}</h2>
              <p className="text-gray-600">Amount: ${(orderDetails.purchase_units?.[0]?.amount?.value || 0)}</p>
              <p className="text-gray-600">Status: {orderDetails.status}</p>
            </div>
            <Button 
              onClick={handleApprove}
              disabled={loading}
              className="w-full"
            >
              {loading ? <LoadingSpinner /> : 'Approve Order'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
