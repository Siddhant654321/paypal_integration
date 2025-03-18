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

      const { orderId } = await response.json();
      console.log("[PAYPAL] Order created successfully:", orderId);
      setOrderID(orderId);
      return orderId;
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      onPaymentError(error instanceof Error ? error.message : 'Failed to create payment');
      throw error;
    }
  };

  const onApprove = async (data: { orderID: string }, actions: any) => {
    try {
      if (!data.orderID) {
        throw new Error("No order ID received from PayPal");
      }

      console.log("[PAYPAL] Payment approved, order ID:", data.orderID);

      // Verify the order ID matches what we created
      if (orderID && orderID !== data.orderID) {
        console.error("[PAYPAL] Order ID mismatch:", { created: orderID, received: data.orderID });
        throw new Error("Payment verification failed");
      }

      // Get order details before capture
      const orderDetails = await actions.order.get();
      console.log("[PAYPAL] Order details before capture:", orderDetails);

      if (!['APPROVED', 'SAVED'].includes(orderDetails.status)) {
        throw new Error("Order not ready for capture. Please try again.");
      }

      console.log("[PAYPAL] Initiating payment capture for order:", data.orderID);

      const response = await fetch('/api/payments/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: data.orderID })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[PAYPAL] Capture failed:", error);
        throw new Error(error.message || 'Failed to capture payment');
      }

      const result = await response.json();
      console.log("[PAYPAL] Payment captured successfully:", result);

      onPaymentSuccess();
    } catch (error) {
      console.error("[PAYPAL] Error capturing payment:", error);
      onPaymentError(error instanceof Error ? error.message : 'Failed to capture payment');
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

  const onInit = () => {
    console.log("[PAYPAL] PayPal buttons initialized");
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <PayPalButtons
        style={{ layout: "vertical" }}
        createOrder={createOrder}
        onApprove={onApprove}
        onCancel={onCancel}
        onError={onError}
        onInit={onInit}
        forceReRender={[amount]}
      />
    </div>
  );
};