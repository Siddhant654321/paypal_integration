import { SellerPaymentService } from './seller-payments';
import { storage } from './storage';

async function testPayPalPayout() {
  try {
    console.log("[PAYPAL] Starting test payout...");

    // Test data for sandbox environment
    const testData = {
      paymentId: 999,
      sellerId: 1,
      amount: 1000, // $10.00 in cents - using a smaller amount for testing
      // Use a sandbox personal account - this should be replaced with an actual sandbox account
      merchantId: "sb-buyer@business.example.com" // Using PayPal's test account format
    };

    console.log("[PAYPAL] Creating test payout with data:", {
      ...testData,
      merchantId: testData.merchantId.substring(0, 8) + '...'
    });

    const result = await SellerPaymentService.createPayout(
      testData.paymentId,
      testData.sellerId,
      testData.amount,
      testData.merchantId
    );

    console.log("[PAYPAL] Payout result:", {
      batchId: result.batch_header.payout_batch_id,
      status: result.batch_header.batch_status,
      timestamp: new Date().toISOString()
    });

    // Record the test payout in our database
    await storage.createSellerPayOut({
      sellerId: testData.sellerId,
      paymentId: testData.paymentId,
      amount: testData.amount,
      paypalPayoutId: result.batch_header.payout_batch_id,
      status: result.batch_header.batch_status,
      createdAt: new Date(),
      completedAt: result.batch_header.batch_status === 'SUCCESS' ? new Date() : null
    });

    console.log("[PAYPAL] Test payout completed successfully");
    return result;
  } catch (error) {
    console.error("[PAYPAL] Test payout failed:", error);
    throw error;
  }
}

// Run the test
testPayPalPayout()
  .then(() => console.log("[PAYPAL] Test completed successfully"))
  .catch(error => console.error("[PAYPAL] Test failed:", error))
  .finally(() => process.exit());