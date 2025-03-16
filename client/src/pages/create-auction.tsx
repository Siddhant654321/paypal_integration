const createAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("[CreateAuction] Starting submission with data:", data);
      
      const formData = new FormData();
      
      // Handle price values
      formData.append('startPrice', String(dollarsToCents(data.startPrice)));
      formData.append('reservePrice', String(dollarsToCents(data.reservePrice || data.startPrice)));
      
      // Handle dates
      formData.append('startDate', new Date(data.startDate).toISOString());
      formData.append('endDate', new Date(data.endDate).toISOString());
      
      // Add other fields
      formData.append('title', data.title);
      formData.append('description', data.description);
      formData.append('species', data.species);
      formData.append('category', data.category);

      // Add image files
      if (selectedFiles.length > 0) {
        selectedFiles.forEach(file => {
          formData.append('images', file);
        });
      }

      console.log("[CreateAuction] Submitting form data");
      const response = await fetch("/api/auctions", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[CreateAuction] Server error response:", errorData);
        throw new Error(errorData.message || 'Failed to create auction');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seller/auctions"] });
      toast({
        title: "Success",
        description: "Auction created successfully",
      const data = await response.json();
      toast({
        title: "Success",
        description: "Auction created successfully and pending approval",
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