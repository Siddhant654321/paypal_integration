import { apiRequest } from "@/lib/queryClient";
import type { Auction } from "@shared/schema";

export async function updateAuctionStatus(auctionId: number, status: string): Promise<Auction> {
  return await apiRequest("PATCH", `/api/auctions/${auctionId}`, { status });
}

export async function sendBuyerNotification(userId: number, message: string): Promise<void> {
  await apiRequest("POST", "/api/notifications", {
    userId,
    type: "auction",
    title: "Auction Update",
    message
  });
}

export async function placeBid(auctionId: number, amount: number) {
  try {
    const response = await apiRequest("POST", `/api/auctions/${auctionId}/bid`, { amount });
    return response;
  } catch (error: any) {
    // Check for different types of profile errors
    if (
      error.response?.status === 403 && 
      (error.response?.data?.error === "profile_incomplete" || 
       error.response?.data?.message?.includes("profile"))
    ) {
      console.log("Profile error detected:", error.response?.data);
      throw new Error("Profile incomplete. Please complete your profile before bidding.");
    }
    throw error;
  }
}