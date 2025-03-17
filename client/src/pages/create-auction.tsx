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
      } catch (error) {
        console.error("[CreateAuction] Network or parsing error:", error);
        console.error("[CREATE AUCTION] Error:", error);
        console.error("[CREATE AUCTION] Full error details:", {
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          data: error
        });
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

const handleSubmit = form.handleSubmit(async (data) => {
    console.log("[CreateAuction] Form submission started", { data });

    try {
      const processedData = {
          ...data,
          startPrice: parseFloat(data.startPrice),
          reservePrice: data.reservePrice ? parseFloat(data.reservePrice) : undefined,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate)
        };

      console.log("[CreateAuction] Processed form data:", processedData);

      // Create FormData object to handle file uploads
      const formData = new FormData();

        // Validate required fields
        if (!processedData.title || !processedData.species || !processedData.category || !processedData.startPrice || !processedData.startDate || !processedData.endDate) {
          throw new Error("Missing required fields");
        }

        // Handle price values - ensure they are numbers first
        const startPrice = dollarsToCents(parseFloat(processedData.startPrice));
        const reservePrice = dollarsToCents(parseFloat(processedData.reservePrice || processedData.startPrice));

        if (isNaN(startPrice) || isNaN(reservePrice)) {
          throw new Error("Invalid price values");
        }

        formData.append('startPrice', String(startPrice));
        formData.append('reservePrice', String(reservePrice));

        // Handle dates
        const startDate = new Date(processedData.startDate);
        const endDate = new Date(processedData.endDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid dates");
        }

        formData.append('startDate', startDate.toISOString());
        formData.append('endDate', endDate.toISOString());

        // Add other fields
        formData.append('title', processedData.title);
        formData.append('description', processedData.description || '');
        formData.append('species', processedData.species);
        formData.append('category', processedData.category);

        // Add image files
        if (processedData.images && processedData.images.length > 0) {
          processedData.images.forEach((file: File) => {
            formData.append('images', file);
          });
          console.log("[CreateAuction] Added", processedData.images.length, "images");
        }


      console.log("[CreateAuction] Submitting form data to mutation");
      await createAuctionMutation.mutateAsync(formData);

      console.log("[CreateAuction] Mutation completed successfully");
      toast({
        title: "Success",
        description: "Auction created successfully",
      });
    } catch (error) {
      console.error("[CreateAuction] Error in form submission:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process form data",
        variant: "destructive",
      });
    }
  });