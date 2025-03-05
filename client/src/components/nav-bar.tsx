
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserCircle, LineChart, Home, LayoutDashboard, Menu, X } from "lucide-react";
import { NotificationsMenu } from "./notifications";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import type { Notification } from "@shared/schema";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function NavBar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Check if we're on mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    retry: 3,
    refetchInterval: 10000,
    staleTime: 5000
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const result = await axios.post("/api/notifications/mark-all-read");
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Notifications marked as read",
        description: "All notifications have been marked as read."
      });
    }
  });

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const handleLogout = async () => {
    try {
      await axios.post("/api/auth/logout");
      queryClient.clear();
      setLocation("/login");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // Navigation items common to both desktop and mobile
  const NavItems = ({ onClick = () => {} }) => (
    <>
      <Link 
        href="/" 
        className="flex items-center text-primary hover:text-primary/80 transition-colors"
        onClick={onClick}
      >
        <Home className="h-5 w-5 mr-1" />
        <span className="font-medium">Home</span>
      </Link>

      <Link 
        href="/auctions" 
        className="text-foreground hover:text-primary transition-colors"
        onClick={onClick}
      >
        Auctions
      </Link>

      <Link 
        href="/analytics" 
        className="flex items-center text-foreground hover:text-primary transition-colors"
        onClick={onClick}
      >
        <LineChart className="h-4 w-4 mr-1" />
        <span>Market</span>
      </Link>

      <Link 
        href="/faq" 
        className="text-foreground hover:text-primary transition-colors"
        onClick={onClick}
      >
        FAQ
      </Link>
    </>
  );

  // Auth related navigation items
  const UserMenu = ({ onClick = () => {} }) => (
    <>
      {user ? (
        <>
          {user.role === "admin" && (
            <Link 
              href="/admin" 
              className="flex items-center text-foreground hover:text-primary transition-colors"
              onClick={onClick}
            >
              <LayoutDashboard className="h-4 w-4 mr-1" />
              <span>Admin</span>
            </Link>
          )}

          {(user.role === "seller" || user.role === "seller_admin") && (
            <Link 
              href="/seller" 
              className="text-foreground hover:text-primary transition-colors"
              onClick={onClick}
            >
              Seller Dashboard
            </Link>
          )}

          <Link 
            href="/bids" 
            className="text-foreground hover:text-primary transition-colors"
            onClick={onClick}
          >
            My Bids
          </Link>

          <Link 
            href="/profile" 
            className="flex items-center text-foreground hover:text-primary transition-colors"
            onClick={onClick}
          >
            <UserCircle className="h-4 w-4 mr-1" />
            <span>Profile</span>
          </Link>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              handleLogout();
              onClick();
            }}
            className="text-foreground hover:text-destructive hover:bg-destructive/10"
          >
            Logout
          </Button>
        </>
      ) : (
        <>
          <Link 
            href="/login" 
            className="text-foreground hover:text-primary transition-colors"
            onClick={onClick}
          >
            Login
          </Link>
          <Link 
            href="/register" 
            className="text-foreground hover:text-primary transition-colors"
            onClick={onClick}
          >
            Register
          </Link>
        </>
      )}
    </>
  );

  return (
    <nav className="sticky top-0 z-50 w-full bg-background border-b shadow-sm">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Pips 'n Chicks Auctions" className="h-8 w-auto" />
              <span className="font-bold text-xl hidden sm:block">Pips 'n Chicks</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-6">
            <NavItems />
          </div>

          {/* Desktop Auth Menu */}
          <div className="hidden md:flex md:items-center md:gap-4">
            {user && <NotificationsMenu notifications={notifications} unreadCount={unreadCount} onMarkAllAsRead={handleMarkAllAsRead} />}
            <UserMenu />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            {user && (
              <div className="mr-2">
                <NotificationsMenu notifications={notifications} unreadCount={unreadCount} onMarkAllAsRead={handleMarkAllAsRead} />
              </div>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[80%] sm:w-[350px] pt-10">
                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-auto py-2">
                    <div className="flex flex-col gap-4 mb-8">
                      <NavItems onClick={() => setIsMenuOpen(false)} />
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="flex flex-col gap-4">
                      <UserMenu onClick={() => setIsMenuOpen(false)} />
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
