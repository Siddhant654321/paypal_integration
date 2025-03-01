import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserCircle, LineChart, Home, LayoutDashboard } from "lucide-react";
import { NotificationsMenu } from "./notifications";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

export default function NavBar() {
  const { user, logoutMutation } = useAuth();
  const [notifications, setNotifications] = useState(initialNotifications);

  const handleMarkAllRead = () => {
    setNotifications(notifications.map(notification => ({
      ...notification,
      read: true
    })));
  };

  return (
    <div className="bg-accent p-4">
      <div className="container mx-auto flex justify-between items-center">
        {/* Left section - Brand and main navigation */}
        <div className="flex items-center gap-4">
          <Link href="/">
            <div className="flex items-center gap-2">
              <img 
                src="/images/logo.png"
                alt="Pips 'n Chicks"
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
                  notifications={notifications} 
                  onMarkAllRead={handleMarkAllRead}
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

// Example notifications (this will be replaced with real data from the backend)
const initialNotifications = [
  {
    id: "1",
    type: "bid" as const,
    message: "New bid on your Brahma chickens auction",
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    type: "auction" as const,
    message: "Your auction has been approved",
    read: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];