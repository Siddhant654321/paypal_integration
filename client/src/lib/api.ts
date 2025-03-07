export async function apiRequest(method: string, url: string, data?: any) {
  try {
    console.log(`[API] ${method} ${url}`, data ? { data } : "");
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    console.log(`[API] Response from ${url}:`, {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
    });

    // Clone the response before parsing it
    const clonedResponse = response.clone();

    // Try to parse the response as JSON
    let responseData;
    try {
      responseData = await response.json();
    } catch (parseError) {
      console.warn(`[API] Could not parse response as JSON:`, parseError);
      responseData = {};
    }

    // Even if the HTTP status is ok (200-299), check for errors in the response body
    if (responseData.error === "profile_incomplete") {
      throw {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        message: responseData.message || "Profile is incomplete"
      };
    }

    // Check for HTTP error status codes
    if (!clonedResponse.ok) {
      throw {
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
        data: responseData,
        message: responseData.message || `Request failed with status ${clonedResponse.status}`,
      };
    }

    return responseData;
  } catch (error) {
    console.error(`[API] Error in ${method} ${url}:`, error);
    throw error;
  }
}