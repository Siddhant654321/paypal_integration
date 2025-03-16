const createAuctionMutation = useMutation({
    mutationFn: async (data: any) => {
      try {
        console.log("[CreateAuction] Starting submission with data:", data);

        const formData = new FormData();

        // Validate required fields
        if (!data.title || !data.species || !data.category || !data.startPrice || !data.startDate || !data.endDate) {
          throw new Error("Missing required fields");
        }

        // Handle price values - ensure they are numbers first
        const startPrice = dollarsToCents(parseFloat(data.startPrice));
        const reservePrice = dollarsToCents(parseFloat(data.reservePrice || data.startPrice));

        if (isNaN(startPrice) || isNaN(reservePrice)) {
          throw new Error("Invalid price values");
        }

        formData.append('startPrice', String(startPrice));
        formData.append('reservePrice', String(reservePrice));

        // Handle dates
        const startDate = new Date(data.startDate);
        const endDate = new Date(data.endDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid dates");
        }

        formData.append('startDate', startDate.toISOString());
        formData.append('endDate', endDate.toISOString());

        // Add other fields
        formData.append('title', data.title);
        formData.append('description', data.description || '');
        formData.append('species', data.species);
        formData.append('category', data.category);

        // Add image files
        if (data.images && data.images.length > 0) {
          data.images.forEach((file: File) => {
            formData.append('images', file);
          });
          console.log("[CreateAuction] Added", data.images.length, "images");
        }

        console.log("[CreateAuction] Submitting form data:", {
          title: data.title,
          startPrice,
          reservePrice,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          imageCount: data.images?.length || 0
        });

      try {
        const response = await fetch("/api/auctions", {
          method: "POST",
          body: formData,
          credentials: "include"
        });

        const contentType = response.headers.get("content-type");
        let errorData;
        
        if (contentType && contentType.includes("application/json")) {
          errorData = await response.json();
        } else {
          errorData = { message: await response.text() };
        }

        if (!response.ok) {
          console.error("[CreateAuction] Server error response:", errorData);
          throw new Error(errorData.message || 'Failed to create auction');
        }

        console.log("[CreateAuction] Server response:", errorData);
        return errorData;
      } catch (error) {
        console.error("[CreateAuction] Network or parsing error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("[CreateAuction] Mutation successful:", data);
      toast({
        title: "Success",
        description: "Auction created successfully and pending approval",
      });
      setLocation("/seller/dashboard");
    },
    onError: (error: any) => {
      console.error("[CreateAuction] Submission error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create auction",
        variant: "destructive"
      });
    }
});