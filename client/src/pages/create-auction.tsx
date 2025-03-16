const createAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log("[CreateAuction] Starting submission with data:", data);
      
      const formData = new FormData();
      
      // Handle price values
      const startPrice = dollarsToCents(data.startPrice);
      const reservePrice = dollarsToCents(data.reservePrice || data.startPrice);
      
      formData.append('startPrice', String(startPrice));
      formData.append('reservePrice', String(reservePrice));
      
      // Handle dates
      const startDate = new Date(data.startDate).toISOString();
      const endDate = new Date(data.endDate).toISOString();
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      
      // Add other fields
      formData.append('title', data.title);
      formData.append('description', data.description);
      formData.append('species', data.species);
      formData.append('category', data.category);

      // Add image files
      if (selectedFiles && selectedFiles.length > 0) {
        selectedFiles.forEach(file => {
          formData.append('images', file);
        });
      }

      console.log("[CreateAuction] Submitting form data:", {
        title: data.title,
        startPrice,
        reservePrice,
        startDate,
        endDate,
        imageCount: selectedFiles?.length || 0
      });

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
      
      const data = await response.json();
      console.log("[CreateAuction] Server response:", data);
      return data;
    },
    onSuccess: () => {
      console.log("[CreateAuction] Mutation successful");
      toast({
        title: "Success",
        description: "Auction created successfully and pending approval",
      });
      setLocation("/seller/dashboard");
    },
    onError: (error) => {
      console.error("[CreateAuction] Mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create auction",
        variant: "destructive"
      });
    }
    onError: (error: Error) => {
      console.error("[CreateAuction] Submission error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create auction",
        variant: "destructive"
      });
    }
});