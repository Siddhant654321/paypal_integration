import { SellerPaymentService } from './seller-payments';
import { storage } from './storage';
import { PaymentStatus } from '@shared/schema';

async function testPayPalPayout() {
  try {
    console.log("[PAYPAL] Starting test payout...");

    // First create a test auction record
    const testAuction = await storage.createAuction({
      sellerId: 1,
      title: "Test Auction for Payout",
      description: "Test auction created for payout testing",
      species: "Test Species",
      category: "Test Category",
      startPrice: 1000, // $10.00 in cents
      reservePrice: 1000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      imageUrl: "https://example.com/test-image.jpg",
      images: ["https://example.com/test-image.jpg"]
    });

    console.log("[PAYPAL] Created test auction record:", {
      auctionId: testAuction.id,
      sellerId: testAuction.sellerId
    });

    // Create a test payment record
    const testPayment = await storage.insertPayment({
      sellerId: testAuction.sellerId,
      buyerId: 2,
      auctionId: testAuction.id,
      amount: 1000, // $10.00 in cents
      platformFee: 100,
      sellerPayout: 900,
      insuranceFee: 0,
      status: 'completed' as PaymentStatus,
      createdAt: new Date(),
      completedAt: new Date()
    });

    console.log("[PAYPAL] Created test payment record:", {
      paymentId: testPayment.id,
      status: testPayment.status
    });

    // Test data for sandbox environment
    const testData = {
      paymentId: testPayment.id,
      sellerId: testAuction.sellerId,
      amount: testPayment.sellerPayout, // Using the actual seller payout amount
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

    return result;
  } catch (error) {
    console.error("[PAYPAL] Test payout failed:", error);
    if (error.response?.data) {
      console.error("[PAYPAL] PayPal API Error Details:", {
        status: error.response.status,
        data: JSON.stringify(error.response.data, null, 2),
        debugId: error.response.data.debug_id,
        details: error.response.data.details || []
      });
    }
    throw error;
  }
}

// Run the test
testPayPalPayout()
  .then(() => console.log("[PAYPAL] Test completed successfully"))
  .catch(error => console.error("[PAYPAL] Test failed:", error))
  .finally(() => process.exit());