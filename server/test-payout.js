
// JavaScript version of the test payout script
import { SellerPaymentService } from './seller-payments.js';
import { storage } from './storage.js';

async function testPayPalPayout() {
  try {
    console.log("[PAYPAL] Starting test payout...");

    // Test data for sandbox environment
    const testData = {
      paymentId: 999,
      sellerId: 1,
      amount: 1000, // $10.00 in cents - using a smaller amount for testing
      // Using PayPal's sandbox test account format - for testing use 'POSPYO001' in note field for positive response
      receiverEmail: "sb-47rbv22431969@business.example.com",
      senderEmail: process.env.PAYPAL_SANDBOX_SENDER_EMAIL || "facilitator@business.example.com"
    };

    console.log("[PAYPAL] Creating test payout with data:", {
      ...testData,
      receiverEmail: testData.receiverEmail.substring(0, 8) + '...',
      senderEmail: testData.senderEmail.substring(0, 8) + '...'
    });

    const result = await SellerPaymentService.createPayout(
      testData.paymentId,
      testData.sellerId,
      testData.amount,
      testData.receiverEmail,
      testData.senderEmail
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
