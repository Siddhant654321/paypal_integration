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
        console.log("[CreateAuction] Submitting form data...");
        const response = await fetch("/api/auctions", {
          method: "POST",
          body: formData,
          credentials: "include"
        });

        console.log("[CreateAuction] Server response status:", response.status);
        
        const contentType = response.headers.get("content-type");
        let responseData;
        
        try {
          if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
          } else {
            const text = await response.text();
            console.log("[CreateAuction] Non-JSON response:", text);
            responseData = { message: text };
          }
        } catch (parseError) {
          console.error("[CreateAuction] Error parsing response:", parseError);
          throw new Error("Failed to parse server response");
        }

        if (!response.ok) {
          console.error("[CreateAuction] Server error response:", responseData);
          throw new Error(responseData.message || 'Failed to create auction');
        }

        return responseData;

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
    onError: (error: Error) => {
      console.error("[CreateAuction] Submission error:", error);
      toast({
        title: "Error Creating Auction",
        description: error.message || "Failed to create auction. Please try again.",
        variant: "destructive"
      });
    }
});