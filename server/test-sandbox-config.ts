import { SellerPaymentService } from './seller-payments';

async function testSandboxConfiguration() {
  try {
    console.log("[PAYPAL] Testing sandbox configuration...");

    // Print environment details
    console.log("[PAYPAL] Environment variables check:", {
      mode: process.env.PAYPAL_ENV || 'not set',
      hasClientId: !!process.env.PAYPAL_CLIENT_ID,
      hasClientSecret: !!process.env.PAYPAL_CLIENT_SECRET,
      hasPartnerId: !!process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID,
      clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 3) || 'n/a'
    });

    // Create a test profile
    const testProfile = {
      id: 999,
      userId: 999,
      fullName: "Sandbox Test Seller",
      email: "sandbox.seller@test.com",
      phoneNumber: "1234567890",
      address: "123 Test St",
      city: "Test City",
      state: "TS",
      zipCode: "12345",
      bio: "Test seller bio",
      paypalMerchantId: null,
      paypalAccountStatus: "not_started",
      isPublicBio: false,
      profilePicture: null,
      emailBidNotifications: true,
      emailAuctionNotifications: true,
      emailPaymentNotifications: true,
      emailFulfillmentNotifications: true,
      emailGeneralNotifications: true,
      emailNewsletterNotifications: true,
      emailNotificationsEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log("[PAYPAL] Attempting to create sandbox seller account...");
    const result = await SellerPaymentService.createSellerAccount(testProfile);

    console.log("[PAYPAL] Sandbox account creation successful:", {
      merchantId: result.merchantId,
      redirectUrl: result.url
    });

    return result;
  } catch (error) {
    console.error("[PAYPAL] Sandbox configuration test failed:", error.message);
    if (error.response?.data) {
      console.error("[PAYPAL] Detailed error:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Run the test
testSandboxConfiguration()
  .then(() => console.log("[PAYPAL] Sandbox configuration test completed successfully"))
  .catch(error => {
    console.error("[PAYPAL] Test failed:", error.message);
    process.exit(1);
  });
