import { EmailService } from './email-service';

async function sendTestEmails() {
  try {
    const testEmail = "pipsnchicks@gmail.com";
    console.log("[EMAIL] Sending test emails to:", testEmail);

    const testUser = {
      id: 999,
      username: "Test User",
      email: testEmail,
      role: "seller_admin",
      approved: true,
      hasProfile: true,
      emailNotificationsEnabled: true,
      password: ""
    };

    // 1. Daily Digest with sample auctions including images
    await EmailService.sendNotification('daily_digest', testUser, {
      newAuctions: [
        {
          id: 1,
          title: "Premium Show Quality Bantam Pair",
          startPrice: 5000, // $50.00
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          imageUrl: "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800",
          description: "Stunning pair of exhibition-quality Bantams. Beautiful plumage, excellent confirmation, and show-winning lineage. Perfect for serious breeders and exhibitors."
        },
        {
          id: 2,
          title: "Heritage Breed Hatching Eggs Collection",
          startPrice: 3500, // $35.00
          endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          imageUrl: "https://images.unsplash.com/photo-1569127959161-2b1297b2d9a6?w=800",
          description: "Rare heritage breed hatching eggs from award-winning bloodlines. High fertility rates, carefully selected and packaged for successful hatching."
        },
        {
          id: 3,
          title: "Exotic Waterfowl Breeding Trio",
          startPrice: 8500, // $85.00
          endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          imageUrl: "https://images.unsplash.com/photo-1557434440-27ba0f1e1c4f?w=800",
          description: "Exceptional breeding trio of rare waterfowl. Proven breeders with excellent genetics and temperament. Perfect for expanding your collection."
        }
      ],
      userName: "Test User"
    });
    console.log("[EMAIL] Sent test daily digest email");

    // 2. New Seller Notification
    await EmailService.sendNotification('admin_new_seller', testUser, {
      sellerName: "John Smith's Heritage Poultry",
      sellerEmail: "john.smith@example.com",
      sellerId: 123
    });
    console.log("[EMAIL] Sent test new seller notification");

    // 3. New Auction Notification with image
    await EmailService.sendNotification('admin_new_auction', testUser, {
      auctionTitle: "Premium Bantam Breeding Pair - Black Cochin",
      sellerName: "Jane's Elite Poultry",
      startPrice: 7500, // $75.00
      category: "Show Quality",
      auctionId: 456,
      imageUrl: "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800",
      description: "Exceptional pair of Black Cochin Bantams from champion bloodlines. Perfect confirmation, beautiful feathering, and excellent temperament. NPIP certified and show-ready."
    });
    console.log("[EMAIL] Sent test new auction notification");

    // 4. Bid Updates (both new bid and outbid)
    await EmailService.sendNotification('bid', testUser, {
      auctionTitle: "Rare Breed Chickens - Silver Sebright Pair",
      bidAmount: 8000, // $80.00
      auctionId: 789,
      isOutbid: false
    });

    await EmailService.sendNotification('bid', testUser, {
      auctionTitle: "Rare Breed Chickens - Silver Sebright Pair",
      bidAmount: 8500, // $85.00
      auctionId: 789,
      isOutbid: true
    });
    console.log("[EMAIL] Sent test bid notifications");

    console.log("[EMAIL] Successfully sent all test emails");
    return true;
  } catch (error) {
    console.error("[EMAIL] Error sending test emails:", error);
    throw error;
  }
}

// Execute the test
sendTestEmails();