import { useQuery } from '@tanstack/react-query';

export function useAuction(auctionId: number) {
  return useQuery({
    queryKey: [`/api/auctions/${auctionId}`],
    enabled: !!auctionId,
  });
}
