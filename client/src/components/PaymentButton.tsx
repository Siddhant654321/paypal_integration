import { useEffect, useState } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";

interface PaymentButtonProps {
  auctionId: number;
  amount: number;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}

export const PaymentButton = ({ auctionId, amount, onPaymentSuccess, onPaymentError }: PaymentButtonProps) => {
  const [{ isResolved, options }] = usePayPalScriptReducer();
  const [orderID, setOrderID] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Log PayPal environment and configuration
  useEffect(() => {
    console.log("[PAYPAL] Client configuration:", {
      sandbox: import.meta.env.VITE_PAYPAL_ENV === 'sandbox',
      amount,
      resolved: isResolved,
      scriptOptions: options
    });
  }, [isResolved, amount, options]);

  const createOrder = async () => {
    try {
      console.log("[PAYPAL] Initiating order creation for amount:", amount);
      setIsProcessing(true);

      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auctionId, amount })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[PAYPAL] Order creation failed:", error);
        throw new Error(error.message || 'Failed to create payment');
      }

      const data = await response.json();
      console.log("[PAYPAL] Order created successfully:", data);
      setOrderID(data.orderId);
      return data.orderId;
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      onPaymentError(error instanceof Error ? error.message : 'Failed to create payment');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const onApprove = async (data: { orderID: string }, actions: any) => {
    try {
      setIsProcessing(true);
      console.log("[PAYPAL] Payment approved by buyer, order ID:", data.orderID);

      // First, approve the order through our backend
      const approvalResponse = await fetch(`/api/auctions/${auctionId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: data.orderID })
      });

      if (!approvalResponse.ok) {
        const error = await approvalResponse.json();
        throw new Error(error.message || 'Failed to approve order');
      }

      console.log("[PAYPAL] Order approved in backend");

      // Now get the order details and verify it's ready for capture
      const order = await actions.order.get();
      console.log("[PAYPAL] Order details:", order);

      if (!['APPROVED', 'COMPLETED'].includes(order.status)) {
        throw new Error(`Order not ready for capture. Status: ${order.status}`);
      }

      // Finally, capture the payment
      console.log("[PAYPAL] Capturing payment");
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
      onPaymentSuccess();
    } catch (error) {
      console.error("[PAYPAL] Error in payment process:", error);
      onPaymentError(error instanceof Error ? error.message : 'Payment processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const onCancel = () => {
    console.log("[PAYPAL] Payment cancelled by user");
    onPaymentError("Payment was cancelled. Please try again.");
  };

  const onError = (error: Record<string, unknown>) => {
    console.error("[PAYPAL] PayPal button error:", error);
    onPaymentError('Payment failed. Please try again or use a different payment method.');
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <PayPalButtons
        style={{ layout: "vertical" }}
        disabled={isProcessing}
        createOrder={createOrder}
        onApprove={onApprove}
        onCancel={onCancel}
        onError={onError}
        forceReRender={[amount]}
      />
    </div>
  );
};