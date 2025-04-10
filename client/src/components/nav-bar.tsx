import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserCircle, LineChart, Home, LayoutDashboard } from "lucide-react";
import { NotificationsMenu } from "./notifications";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import type { Notification } from "@shared/schema";

export default function NavBar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    retry: 3,
    refetchInterval: 10000,
    staleTime: 5000
  });

  // Use the same logout function from AuthContext for consistency
  const { logout } = useAuth();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        console.log("[AUTH] Starting logout process");

        // Use direct fetch with explicit logging
        const response = await fetch('/api/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        // Log response status
        console.log("[AUTH] Logout response status:", {
          status: response.status,
          ok: response.ok
        });

        // Parse response if possible
        let data = { success: response.ok };
        try {
          data = await response.json();
        } catch (parseError) {
          console.log("[AUTH] No JSON in logout response");
        }

        console.log("[AUTH] Logout response data:", data);

        // Always return success to ensure client-side cleanup
        return true;
      } catch (error) {
        console.error('[AUTH] Logout network error:', error);
        // Still return success to clear the local session state
        return true;
      }
    },
    onSuccess: () => {
      console.log("[AUTH] Logout successful, clearing client state");

      // Clear all query cache
      queryClient.clear();
      queryClient.setQueryData(['/api/user'], null);

      // Force refresh user state
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });

      // Add a small delay before navigation to ensure state is updated
      setTimeout(() => {
        setLocation('/');

        toast({
          title: 'Logged out',
          description: 'You have been successfully logged out.'
        });
      }, 100);
    },
    onError: () => {
      console.log("[AUTH] Logout encountered an error, still clearing client state");

      // Even on error, clear client state
      queryClient.clear();
      queryClient.setQueryData(['/api/user'], null);

      setTimeout(() => {
        setLocation('/');

        toast({
          title: 'Logged out',
          description: 'You have been logged out on this device.',
          variant: 'default',
        });
      }, 100);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      console.log("[NavBar] Marking all notifications as read");
      return axios.post("/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Notifications",
        description: "All notifications marked as read"
      });
    },
    onError: (err) => {
      console.error("[NavBar] Error marking all notifications as read:", err);
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive"
      });
    }
  });

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  return (
    <div className="bg-accent p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/">
            <div className="flex items-center gap-2">
              <img 
                src={`/images/logo.png?v=${Date.now()}`}
                alt="Pips 'n Chicks Auctions"
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  console.error("Logo failed to load, attempting fallback");
                  e.currentTarget.src = `/attached_assets/Auctions Logos (2).png?v=${Date.now()}`;
                }}
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
          <Link href="/faq">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              FAQ
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
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

              <div className="flex items-center gap-2">
                <NotificationsMenu 
                  notifications={notifications} 
                  onMarkAllRead={handleMarkAllRead} 
                />

                <Link href="/profile">
                  <Button 
                    variant={user.hasProfile ? "ghost" : "default"}
                    size="sm"
                    className={!user.hasProfile ? "bg-primary text-primary-foreground" : ""}
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
                      if (user?.hasProfile) {
                        setLocation('/profile');
                      } else {
                        setLocation('/profile?action=create');
                      }
                    }}
                  >
                    <UserCircle className="mr-2 h-4 w-4" />
                    {user.hasProfile ? "Profile" : "Complete Profile"}
                  </Button>
                </Link>
                <Button onClick={() => logoutMutation.mutate()} variant="ghost">Logout</Button>
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