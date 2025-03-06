import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      // Preserve full error response for profile_incomplete
      if (res.status === 403 && json.error === "profile_incomplete") {
        const error = new Error(json.message);
        error.name = "ProfileIncompleteError";
        Object.assign(error, json); // Add all error properties to the error object
        throw error;
      }
      throw new Error(json.message || `${res.status}: ${res.statusText}`);
    } catch (e) {
      if (e.name === "ProfileIncompleteError") throw e;
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
  }
}

export async function apiRequest<T>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  console.log(`[API] ${method} ${url}`, { data });

  const response = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // Always include credentials
  });

  console.log(`[API] Response from ${url}:`, {
    status: response.status,
    ok: response.ok,
    statusText: response.statusText
  });

  await throwIfResNotOk(response);
  return response.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    console.log(`[QUERY] Fetching ${queryKey[0]}`);

    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    console.log(`[QUERY] Response for ${queryKey[0]}:`, {
      status: res.status,
      ok: res.ok
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();
    console.log(`[QUERY] Parsed data for ${queryKey[0]}:`, data);
    return data;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount, error) => {
        // Don't retry on 401/403
        if (error instanceof Error && error.message.startsWith('401:')) return false;
        if (error instanceof Error && error.message.startsWith('403:')) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
      onError: (error) => {
        console.error('[MUTATION] Error:', error);
      }
    },
  },
});