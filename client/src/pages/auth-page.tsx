import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { Redirect, useLocation, Link } from "wouter";
import { z } from "zod";
import { useSearchParams } from "../hooks/use-search-params";
import { useEffect, useState } from "react";

// Schema for forgot password form
const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
});

// Schema for reset password form
const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, { message: "Password must be at least 8 characters long" }),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function AuthPage() {
  const { 
    user, 
    loginMutation, 
    registerMutation, 
    forgotPasswordMutation, 
    resetPasswordMutation,
    verifyResetTokenMutation 
  } = useAuth();
  
  const [location, setLocation] = useLocation();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'login';
  const resetToken = searchParams.get('token');
  
  // State to track if token is valid
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  
  // Check token validity if a token is present
  useEffect(() => {
    if (resetToken) {
      setIsVerifyingToken(true);
      verifyResetTokenMutation.mutate(
        { token: resetToken },
        {
          onSuccess: () => {
            setIsTokenValid(true);
            setIsVerifyingToken(false);
          },
          onError: () => {
            setIsTokenValid(false);
            setIsVerifyingToken(false);
          }
        }
      );
    }
  }, [resetToken, verifyResetTokenMutation]);

  const loginForm = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      role: "buyer" as const,
    },
  });
  
  const forgotPasswordForm = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });
  
  const resetPasswordForm = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  // If user is already logged in, redirect to home
  if (user) {
    return <Redirect to="/" />;
  }
  
  const handleForgotPassword = (data: z.infer<typeof forgotPasswordSchema>) => {
    forgotPasswordMutation.mutate(data);
  };
  
  const handleResetPassword = (data: z.infer<typeof resetPasswordSchema>) => {
    if (resetToken) {
      resetPasswordMutation.mutate({
        token: resetToken,
        newPassword: data.newPassword,
      });
    }
  };

  // Determine what to display based on token presence and validity
  if (resetToken) {
    if (isVerifyingToken) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle>Verifying Reset Link</CardTitle>
              <CardDescription>
                Please wait while we verify your password reset link...
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center p-6">
              <Loader2 className="h-8 w-8 animate-spin" />
            </CardContent>
          </Card>
        </div>
      );
    }
    
    if (!isTokenValid) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle>Invalid Reset Link</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Please request a new password reset link.
              </p>
              <Button 
                className="w-full" 
                onClick={() => setLocation("/auth?tab=forgot-password")}
              >
                Request New Link
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    // Valid token - show reset password form
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Reset Your Password</CardTitle>
            <CardDescription>
              Please enter your new password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form 
              onSubmit={resetPasswordForm.handleSubmit(handleResetPassword)}
              className="space-y-4 mt-4"
            >
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  {...resetPasswordForm.register("newPassword")}
                  required
                />
                {resetPasswordForm.formState.errors.newPassword && (
                  <p className="text-sm text-red-500">
                    {resetPasswordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  {...resetPasswordForm.register("confirmPassword")}
                  required
                />
                {resetPasswordForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-red-500">
                    {resetPasswordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Reset Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Standard auth page (no token present)
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Welcome to Pips 'n Chicks</CardTitle>
            <CardDescription>
              Sign in to your account or create a new one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={defaultTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
                <TabsTrigger value="forgot-password">Forgot</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form
                  onSubmit={loginForm.handleSubmit((data) =>
                    loginMutation.mutate(data)
                  )}
                  className="space-y-4 mt-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      {...loginForm.register("username")}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      {...loginForm.register("password")}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Sign In
                  </Button>
                </form>
                <div className="mt-4 text-center">
                  <a 
                    className="text-sm text-primary hover:underline cursor-pointer"
                    onClick={() => setLocation("/auth?tab=forgot-password")}
                  >
                    Forgot password?
                  </a>
                </div>
              </TabsContent>

              <TabsContent value="register">
                <form
                  onSubmit={registerForm.handleSubmit((data) =>
                    registerMutation.mutate(data)
                  )}
                  className="space-y-4 mt-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">Username</Label>
                    <Input
                      id="reg-username"
                      {...registerForm.register("username")}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      {...registerForm.register("email")}
                      required
                    />
                    {registerForm.formState.errors.email && (
                      <p className="text-sm text-red-500">
                        {registerForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      {...registerForm.register("password")}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Account Type</Label>
                    <Select
                      value={registerForm.watch("role")}
                      onValueChange={(value: "buyer" | "seller") =>
                        registerForm.setValue("role", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="seller">Seller</SelectItem>
                      </SelectContent>
                    </Select>
                    {registerForm.formState.errors.role && (
                      <p className="text-sm text-red-500">
                        {registerForm.formState.errors.role.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="forgot-password">
                <div className="mt-4 mb-6">
                  <p className="text-sm text-muted-foreground">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>
                </div>
                <form
                  onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email Address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      {...forgotPasswordForm.register("email")}
                      required
                    />
                    {forgotPasswordForm.formState.errors.email && (
                      <p className="text-sm text-red-500">
                        {forgotPasswordForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={forgotPasswordMutation.isPending}
                  >
                    {forgotPasswordMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Send Reset Link
                  </Button>
                </form>
                <div className="mt-4 text-center">
                  <a 
                    className="text-sm text-primary hover:underline cursor-pointer"
                    onClick={() => setLocation("/auth?tab=login")}
                  >
                    Back to login
                  </a>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div
        className="hidden lg:block bg-cover bg-center"
        style={{
          backgroundImage: 'url("/images/speckled-chicken.jpg")',
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      >
        <div className="h-full w-full bg-black/30 backdrop-blur-[2px] p-8 flex items-center justify-center">
          <div className="max-w-md text-white">
            <h1 className="text-4xl font-bold mb-4">
              Premium Poultry Auctions
            </h1>
            <p className="text-lg">
              Connect with trusted breeders, find quality birds and hatching eggs,
              and grow your collection with confidence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}