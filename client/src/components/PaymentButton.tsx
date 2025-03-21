import { useState } from 'react';
import { PayPalButtons } from "@paypal/react-paypal-js";

interface PaymentButtonProps {
  auctionId: number;
  amount: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function PaymentButton({ auctionId, amount, onSuccess, onError }: PaymentButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const createOrder = async () => {
    try {
      console.log("[PAYPAL] Creating order for auction:", auctionId);
      const response = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          auctionId, 
          amount 
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create order');
      }

      const data = await response.json();
      console.log("[PAYPAL] Order created:", data.orderId);
      return data.orderId;
    } catch (error) {
      console.error('[PAYPAL] Error creating order:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to create order');
      throw error;
    }
  };

  const onApprove = async (data: any, actions: any) => {
    try {
      setIsProcessing(true);
      console.log("[PAYPAL] Payment approved by buyer, order ID:", data.orderID);

      // Get order details to verify status
      const order = await actions.order.get();
      console.log("[PAYPAL] Order details:", order);

      if (!['APPROVED', 'COMPLETED'].includes(order.status)) {
        throw new Error(`Order not ready for capture. Status: ${order.status}`);
      }

      // Capture the payment through our backend
      const captureResponse = await fetch('/api/payments/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: data.orderID })
      });

      if (!captureResponse.ok) {
        const error = await captureResponse.json();
        throw new Error(error.message || 'Failed to capture payment');
      }

      console.log("[PAYPAL] Payment captured successfully");
      onSuccess?.();
    } catch (error) {
      console.error("[PAYPAL] Error in payment process:", error);
      onError?.(error instanceof Error ? error.message : 'Payment processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const onCancel = () => {
    console.log("[PAYPAL] Payment cancelled by user");
    onError?.('Payment cancelled. Please try again.');
  };

  const handleError = (err: any) => {
    console.error("[PAYPAL] Payment error:", err);
    onError?.('Payment failed. Please try again or use a different payment method.');
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <PayPalButtons
        style={{
          layout: "vertical",
          shape: "rect",
        }}
        createOrder={createOrder}
        onApprove={onApprove}
        onCancel={onCancel}
        onError={handleError}
        disabled={isProcessing}
      />
    </div>
  );
}