import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData): Promise<SelectUser> => {
      console.log("[AUTH] Attempting login with credentials:", credentials.username);

      // Log the API call for debugging
      console.log("[API] POST /api/login", { data: credentials });

      try {
        // Use a more explicit fetch with detailed logging
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Critical for session cookies
          body: JSON.stringify(credentials)
        });

        // Log the response status
        console.log("[API] Response from /api/login:", {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText
        });

        // Handle non-JSON responses gracefully
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error("[AUTH] Error parsing JSON response:", parseError);
          data = {};
        }

        if (!response.ok) {
          throw new Error(data.message || "Login failed");
        }

        return data;
      } catch (err) {
        console.error("[AUTH] Login network error:", err);
        throw err;
      }
    },
    onSuccess: (userData) => {
      console.log("[AUTH] Login successful, setting user data:", userData);

      // Update cache with user data
      queryClient.setQueryData(["/api/user"], userData);

      // Force refresh user data
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });

      // Verify session with a separate request
      fetch('/api/session/check', { 
        credentials: 'include'
      }).then(resp => resp.json())
        .then(data => console.log("[AUTH] Session verified:", data))
        .catch(err => console.error("[AUTH] Session verification failed:", err));

      toast({
        title: "Welcome back!",
        description: `You've successfully logged in as ${userData.username}`,
      });

      setLocation("/");
    },
    onError: (error: Error) => {
      console.error("[AUTH] Login error:", error);

      toast({
        title: "Login failed",
        description: error.message || "An error occurred during login",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: InsertUser) => {
      console.log("[AUTH] Registering user:", userData.username);

      try {
        // Use direct fetch for registration
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(userData)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error("[AUTH] Registration API error:", data);
          throw new Error(data.message || "Registration failed");
        }

        console.log("[AUTH] Registration response:", data);
        return data;
      } catch (err) {
        console.error("[AUTH] Registration network error:", err);
        throw err;
      }
    },
    onSuccess: (data) => {
      console.log("[AUTH] Registration successful:", data);

      toast({
        title: "Registration successful",
        description: "Please log in with your new account",
      });

      // Redirect to login tab
      setTimeout(() => {
        setLocation("/auth?tab=login");
      }, 1000);
    },
    onError: (error: Error) => {
      console.error("[AUTH] Registration error:", error);

      toast({
        title: "Registration failed",
        description: error.message || "An error occurred during registration",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("[AUTH] Attempting logout");
      const response = await apiRequest("POST", "/api/logout");
      if (!response.ok) {
        throw new Error("Logout failed");
      }
    },
    onSuccess: () => {
      console.log("[AUTH] Logout successful, clearing cache");
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
      setLocation("/auth");
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    },
    onError: (error: Error) => {
      console.error("[AUTH] Logout error:", error);
      toast({
        title: "Logout failed",
        description: error.message || "Failed to log out",
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}