const createAuctionMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/auctions", data);
      if (!response.ok) {
        throw new Error(response.message || 'Failed to create auction');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seller/auctions"] });
      toast({
        title: "Success",
        description: "Auction created successfully",
      });
      router.push("/seller/dashboard");
    },
});