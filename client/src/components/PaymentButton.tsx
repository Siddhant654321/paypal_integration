import { useEffect, useState } from 'react';
import { PayPalButtons } from "@paypal/react-paypal-js";

interface PaymentButtonProps {
  auctionId: number;
  amount: number;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}

export const PaymentButton = ({ auctionId, amount, onPaymentSuccess, onPaymentError }: PaymentButtonProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

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
      return data.orderId;
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      onPaymentError(error instanceof Error ? error.message : 'Failed to create payment');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const onApprove = async (data: { orderID: string }) => {
    try {
      setIsProcessing(true);
      console.log("[PAYPAL] Payment approved by buyer, order ID:", data.orderID);

      // First, confirm the order
      const confirmResponse = await fetch(`/api/payments/${data.orderID}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json();
        throw new Error(error.message || 'Failed to confirm order');
      }

      console.log("[PAYPAL] Order confirmed");

      // Then, authorize the order
      const authResponse = await fetch(`/api/payments/${data.orderID}/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!authResponse.ok) {
        const error = await authResponse.json();
        throw new Error(error.message || 'Failed to authorize payment');
      }

      const authData = await authResponse.json();
      console.log("[PAYPAL] Payment authorized:", authData);

      // Finally, capture the authorized payment
      const captureResponse = await fetch('/api/payments/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          orderId: data.orderID,
          authorizationId: authData.authorizationId
        })
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