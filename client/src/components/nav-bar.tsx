import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2, UserCircle, LineChart } from "lucide-react";
import { NotificationsMenu } from "./notifications";
import { useState } from "react";

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
        <Link href="/">
          <h2 className="text-2xl font-bold text-accent-foreground cursor-pointer">
            Pips 'n Chicks
          </h2>
        </Link>
        <div className="flex gap-4 items-center">
          {/* Analytics link - always visible */}
          <Link href="/analytics">
            <Button variant="secondary" className="flex items-center gap-2">
              <LineChart className="h-4 w-4" />
              Market Analytics
            </Button>
          </Link>

          {user ? (
            <>
              {/* Add NotificationsMenu before user info */}
              <NotificationsMenu 
                notifications={notifications} 
                onMarkAllRead={handleMarkAllRead}
              />

              <span className="text-accent-foreground">
                Welcome, {user.username}!
              </span>

              {/* Profile Link - Highlighted if not completed */}
              <Link href="/profile">
                <Button 
                  variant={user.hasProfile ? "secondary" : "default"}
                  className={!user.hasProfile ? "bg-primary text-primary-foreground" : ""}
                >
                  <UserCircle className="mr-2 h-4 w-4" />
                  {user.hasProfile ? "Profile" : "Complete Profile"}
                </Button>
              </Link>

              {(user.role === "admin" || user.role === "seller_admin") && (
                <Link href="/admin">
                  <Button variant="secondary">Admin Dashboard</Button>
                </Link>
              )}
              {(user.role === "seller" || user.role === "seller_admin") && (
                <Link href="/seller/dashboard">
                  <Button variant="secondary">Seller Dashboard</Button>
                </Link>
              )}
              <Link href="/buyer/dashboard">
                <Button variant="secondary">My Bids</Button>
              </Link>
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