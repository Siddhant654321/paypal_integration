
import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { Button } from '../components/ui/button';
import { LoadingSpinner } from '../components/ui/loading-spinner';

export default function ReviewOrderPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');
  const auctionId = params.get('auctionId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    if (!orderId || !auctionId) {
      setError('Missing order information');
      setLoading(false);
      return;
    }

    loadOrderDetails();
  }, [orderId, auctionId]);

  const loadOrderDetails = async () => {
    try {
      const response = await fetch(`/api/payment/${orderId}`);
      if (!response.ok) {
        throw new Error('Failed to load order details');
      }
      const data = await response.json();
      setOrderDetails(data);
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
    return <LoadingSpinner />;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Review Your Order</h1>
      {orderDetails && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl mb-4">Order Details</h2>
          <div className="mb-4">
            <p className="text-gray-600">Amount: ${(orderDetails.amount?.value || 0)}</p>
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
    </div>
  );
}
