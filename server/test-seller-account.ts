import { SellerPaymentService } from './seller-payments';
import { storage } from './storage';
import { Profile } from '@shared/schema';

async function testSellerAccountCreation() {
  try {
    console.log("[PAYPAL] Starting seller account creation test...");

    // Create a test profile
    const testProfile: Profile = {
      id: 1,
      userId: 1,
      fullName: "Test Seller",
      email: "test.seller@example.com",
      phoneNumber: "1234567890",
      address: "123 Test St",
      city: "Test City",
      state: "TS",
      zipCode: "12345",
      bio: "Test seller bio",
      paypalMerchantId: null,
      paypalAccountStatus: "not_started"
    };

    console.log("[PAYPAL] Test profile:", {
      userId: testProfile.userId,
      email: testProfile.email
    });

    // Attempt to create seller account
    const result = await SellerPaymentService.createSellerAccount(testProfile);

    console.log("[PAYPAL] Seller account creation result:", {
      merchantId: result.merchantId,
      url: result.url
    });

    return result;
  } catch (error) {
    console.error("[PAYPAL] Test failed:", error);
    if (error.response?.data) {
      console.error("[PAYPAL] PayPal API Error Details:", {
        status: error.response.status,
        url: error.config?.url,
        data: JSON.stringify(error.response.data, null, 2),
        details: error.response.data.details || []
      });
    }
    throw error;
  }
}

// Run the test
testSellerAccountCreation()
  .then(() => console.log("[PAYPAL] Test completed successfully"))
  .catch(error => console.error("[PAYPAL] Test failed:", error))
  .finally(() => process.exit());
