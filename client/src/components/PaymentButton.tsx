import { useEffect, useState } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";

interface PaymentButtonProps {
  auctionId: number;
  amount: number;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

export default function PaymentButton({ auctionId, amount, onSuccess, onError }: PaymentButtonProps) {
  const [{ isResolved }] = usePayPalScriptReducer();
  const [orderId, setOrderId] = useState<string | null>(null);

  const createOrder = async () => {
    try {
      const response = await fetch(`/api/auctions/${auctionId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount })
      });

      const data = await response.json();
      if (!data.orderId) {
        throw new Error('Failed to create PayPal order');
      }

      setOrderId(data.orderId);
      return data.orderId;
    } catch (error) {
      console.error('Error creating order:', error);
      onError?.(error);
      throw error;
    }
  };

  const onApprove = async (data: any) => {
    try {
      // First approve the order
      await fetch(`/api/auctions/${auctionId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: data.orderID })
      });

      // Then capture the payment
      const response = await fetch(`/api/payments/${data.orderID}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();

      if (result.success) {
        onSuccess?.();
      } else {
        throw new Error(result.message || 'Payment capture failed');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      onError?.(error);
    }
  };

  return (
    <div>
      {isResolved && (
        <PayPalButtons
          createOrder={createOrder}
          onApprove={onApprove}
          onError={(err) => {
            console.error('PayPal error:', err);
            onError?.(err);
          }}
          style={{
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'pay'
          }}
        />
      )}
    </div>
  );
}