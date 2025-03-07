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
      const response = await apiRequest("POST", "/api/login", credentials);

      if (!response.ok) {
        throw new Error("Authentication failed");
      }

      const data = await response.json();
      console.log("[AUTH] Login response:", data);
      return data as SelectUser;
    },
    onSuccess: (user: SelectUser) => {
      console.log("[AUTH] Login successful, updating cache");
      queryClient.setQueryData(["/api/user"], user);
      setLocation("/");
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
    },
    onError: (error: Error) => {
      console.error("[AUTH] Login error:", error);
      toast({
        title: "Login failed",
        description: error.message || "Authentication failed",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: InsertUser): Promise<SelectUser> => {
      console.log("[AUTH] Attempting registration");
      const response = await apiRequest("POST", "/api/register", userData);

      if (!response.ok) {
        throw new Error("Registration failed");
      }

      const data = await response.json();
      console.log("[AUTH] Registration response:", data);
      return data as SelectUser;
    },
    onSuccess: (user: SelectUser) => {
      console.log("[AUTH] Registration successful, updating cache");
      queryClient.setQueryData(["/api/user"], user);
      setLocation("/");
      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("[AUTH] Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("[AUTH] Attempting logout");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch('/api/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        let success = response.ok;
        let message = "Logged out successfully";

        try {
          const data = await response.json();
          message = data.message || message;
        } catch (parseError) {
          console.log("[AUTH] No JSON response from logout endpoint");
        }

        console.log("[AUTH] Logout response:", { success, message });
        return { success, message };
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("[AUTH] Logout network error:", err);
        return { 
          success: true, // Consider network errors as successful logout for client side
          message: "Session ended locally" 
        };
      }
    },
    onSuccess: (result) => {
      console.log("[AUTH] Clearing client-side session data");
      // Always clear cache and user data
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);

      // Redirect to auth page
      setLocation("/auth");

      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    },
    onError: (error) => {
      console.error("[AUTH] Logout error:", error);
      // Still clear client-side state on error
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
      setLocation("/auth");

      toast({
        title: "Logged out",
        description: "Your session has been ended.",
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