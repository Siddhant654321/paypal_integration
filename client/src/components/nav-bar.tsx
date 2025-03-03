import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserCircle, LineChart, Home, LayoutDashboard } from "lucide-react";
import { NotificationsMenu } from "./notifications";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import axios from "axios";
import type { Notification } from "@shared/schema";

export default function NavBar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  // Enhanced notification fetching with detailed logging
  const { data: notifications = [], error: notificationError } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 10000, // Increased frequency for testing
    staleTime: 5000,
    onSuccess: (data) => {
      console.log("[Notifications] Fetch successful:", {
        count: data.length,
        unreadCount: data.filter(n => !n.read).length,
        latestNotification: data[0]
      });
    },
    onError: (error) => {
      console.error("[Notifications] Fetch error:", error);
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post("/api/logout");
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
      router.push("/");
    },
    onError: (error) => {
      console.error("Logout error:", error);
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="bg-accent p-4">
      <div className="container mx-auto flex justify-between items-center">
        {/* Left section - Brand and main navigation */}
        <div className="flex items-center gap-4">
          <Link href="/">
            <div className="flex items-center gap-2">
              <img 
                src="/favicon.png"
                alt="Pips 'n Chicks Auctions"
                className="h-10 w-auto object-contain"
              />
            </div>
          </Link>

          <Link href="/">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Home
            </Button>
          </Link>

          <Link href="/analytics">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              Market Analytics
            </Button>
          </Link>
        </div>

        {/* Right section - User-specific navigation */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {/* Dashboards section */}
              <div className="flex items-center gap-2">
                {(user.role === "seller" || user.role === "seller_admin") && (
                  <Link href="/seller/dashboard">
                    <Button variant="ghost" size="sm" className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Seller Dashboard
                    </Button>
                  </Link>
                )}
                <Link href="/buyer/dashboard">
                  <Button variant="ghost" size="sm">My Bids</Button>
                </Link>
                {(user.role === "admin" || user.role === "seller_admin") && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm">Admin</Button>
                  </Link>
                )}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* User section */}
              <div className="flex items-center gap-2">
                <NotificationsMenu 
                  notifications={notifications || []} 
                  onMarkAllRead={() => {
                    // markAllReadMutation will be handled in the NotificationsMenu component
                  }}
                />

                <Link href="/profile">
                  <Button 
                    variant={user.hasProfile ? "ghost" : "default"}
                    size="sm"
                    className={!user.hasProfile ? "bg-primary text-primary-foreground" : ""}
                  >
                    <UserCircle className="mr-2 h-4 w-4" />
                    {user.hasProfile ? "Profile" : "Complete Profile"}
                  </Button>
                </Link>
                <Button onClick={logoutMutation.mutate} variant="ghost">Logout</Button>
              </div>
            </>
          ) : (
            <Link href="/auth">
              <Button>Login / Register</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}