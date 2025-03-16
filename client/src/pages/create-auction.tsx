const createAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("[CreateAuction] Starting submission with data:", data);
      
      // Format the data
      const formData = {
        ...data,
        startPrice: Number(data.startPrice),
        reservePrice: Number(data.reservePrice || data.startPrice),
        startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
        endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
      };

      console.log("[CreateAuction] Submitting formData:", formData);
      const response = await apiRequest("POST", "/api/auctions", formData);
      
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
    onError: (error: Error) => {
      console.error("[CreateAuction] Submission error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create auction",
        variant: "destructive"
      });
    }
});