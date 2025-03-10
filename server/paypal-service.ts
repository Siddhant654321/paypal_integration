import paypal from "@paypal/checkout-server-sdk";
import { storage } from "./storage";
import { NotificationService } from "./notification-service";

// Environment validation
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("Missing PayPal environment variables");
}

// PayPal client configuration
const environment = new paypal.core.SandboxEnvironment(
  process.env.PAYPAL_CLIENT_ID,
  process.env.PAYPAL_CLIENT_SECRET
);
const client = new paypal.core.PayPalHttpClient(environment);

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

export class PayPalService {
  static async createOrder(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false
  ) {
    try {
      console.log("[PAYPAL] Creating order", {
        auctionId,
        buyerId,
        includeInsurance
      });

      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Verify buyer is winning bidder
      if (auction.winningBidderId !== buyerId) {
        throw new Error("Only the winning bidder can make payment");
      }

      // Calculate fees
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;

      console.log("[PAYPAL] Fee calculation", {
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount
      });

      const request = new paypal.orders.OrdersCreateRequest();
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "USD",
            value: (totalAmount / 100).toFixed(2), // Convert cents to dollars
            breakdown: {
              item_total: {
                currency_code: "USD",
                value: (baseAmount / 100).toFixed(2)
              },
              handling: {
                currency_code: "USD",
                value: ((platformFee + insuranceFee) / 100).toFixed(2)
              }
            }
          },
          description: `Payment for "${auction.title}"`,
          custom_id: JSON.stringify({
            auctionId,
            buyerId,
            sellerId: auction.sellerId,
            platformFee,
            insuranceFee
          })
        }]
      });

      const order = await client.execute(request);
      console.log("[PAYPAL] Order created", {
        orderId: order.result.id
      });

      return {
        orderId: order.result.id,
        approvalUrl: order.result.links.find(link => link.rel === "approve")?.href
      };

    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      throw error;
    }
  }

  static async capturePayment(orderId: string) {
    try {
      console.log("[PAYPAL] Capturing payment for order:", orderId);

      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      const capture = await client.execute(request);

      if (capture.result.status !== "COMPLETED") {
        throw new Error(`Payment capture failed: ${capture.result.status}`);
      }

      // Extract the original order details
      const customId = JSON.parse(capture.result.purchase_units[0].custom_id);
      const { auctionId, buyerId, sellerId, platformFee, insuranceFee } = customId;

      // Create payment record
      const payment = await storage.insertPayment({
        auctionId,
        buyerId,
        sellerId,
        amount: Math.round(parseFloat(capture.result.purchase_units[0].amount.value) * 100),
        platformFee,
        insuranceFee,
        sellerPayout: Math.round(parseFloat(capture.result.purchase_units[0].payments.captures[0].amount.value) * 100),
        paypalOrderId: orderId,
        status: "completed",
        payoutProcessed: false
      });

      console.log("[PAYPAL] Payment record created", { paymentId: payment.id });

      // Update auction status
      await storage.updateAuction(auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "completed"
      });

      // Send notification
      await NotificationService.notifyPayment(
        sellerId,
        payment.amount,
        "completed"
      );

      return payment;

    } catch (error) {
      console.error("[PAYPAL] Error capturing payment:", error);
      throw error;
    }
  }
}
