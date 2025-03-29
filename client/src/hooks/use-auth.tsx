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
  forgotPasswordMutation: UseMutationResult<void, Error, ForgotPasswordData>;
  resetPasswordMutation: UseMutationResult<void, Error, ResetPasswordData>;
  verifyResetTokenMutation: UseMutationResult<{ userId: number }, Error, { token: string }>;
};

type LoginData = Pick<InsertUser, "username" | "password">;
type ForgotPasswordData = { email: string };
type ResetPasswordData = { token: string; newPassword: string };

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
  
  // Password reset request mutation
  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordData) => {
      console.log("[AUTH] Requesting password reset for email:", data.email);
      
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        console.error("[AUTH] Password reset request error:", responseData);
        throw new Error(responseData.message || "Failed to request password reset");
      }
      
      return responseData;
    },
    onSuccess: () => {
      toast({
        title: "Password Reset Email Sent",
        description: "If the email exists in our system, you will receive password reset instructions shortly.",
      });
    },
    onError: (error: Error) => {
      console.error("[AUTH] Password reset request error:", error);
      toast({
        title: "Password Reset Request Failed",
        description: error.message || "An error occurred. Please try again later.",
        variant: "destructive",
      });
    },
  });
  
  // Verify reset token mutation
  const verifyResetTokenMutation = useMutation({
    mutationFn: async ({ token }: { token: string }) => {
      console.log("[AUTH] Verifying reset token");
      
      const response = await fetch(`/api/reset-password/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        console.error("[AUTH] Token verification error:", data);
        throw new Error(data.message || "Invalid or expired reset token");
      }
      
      return { userId: data.userId };
    },
    onError: (error: Error) => {
      console.error("[AUTH] Token verification error:", error);
      toast({
        title: "Invalid Reset Link",
        description: error.message || "The password reset link is invalid or has expired.",
        variant: "destructive",
      });
      
      // Redirect to forgot password page after a short delay
      setTimeout(() => {
        setLocation("/auth?tab=forgot-password");
      }, 2000);
    },
  });
  
  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordData) => {
      console.log("[AUTH] Resetting password with token");
      
      const response = await fetch(`/api/reset-password/${data.token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword: data.newPassword })
      });
      
      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        console.error("[AUTH] Password reset error:", responseData);
        throw new Error(responseData.message || "Failed to reset password");
      }
      
      return responseData;
    },
    onSuccess: () => {
      toast({
        title: "Password Reset Successful",
        description: "Your password has been reset. Please log in with your new password.",
      });
      
      // Redirect to login page after a short delay
      setTimeout(() => {
        setLocation("/auth?tab=login");
      }, 2000);
    },
    onError: (error: Error) => {
      console.error("[AUTH] Password reset error:", error);
      toast({
        title: "Password Reset Failed",
        description: error.message || "An error occurred. Please try again later.",
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
        forgotPasswordMutation,
        resetPasswordMutation,
        verifyResetTokenMutation,
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