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
