import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserCircle, LineChart, Home, LayoutDashboard, Menu } from "lucide-react";
import { NotificationsMenu } from "./notifications";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function NavBar() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMarkAllRead = () => {
    setNotifications(notifications.map(notification => ({
      ...notification,
      read: true
    })));
  };

  const NavItems = () => (
    <>
      <Link href="/">
        <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-accent">
          <Home className="h-4 w-4" />
          <span>Home</span>
        </Button>
      </Link>

      <Link href="/analytics">
        <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-accent">
          <LineChart className="h-4 w-4" />
          <span>Market Analytics</span>
        </Button>
      </Link>

      {user && (
        <>
          {(user.role === "seller" || user.role === "seller_admin") && (
            <Link href="/seller/dashboard">
              <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-accent">
                <LayoutDashboard className="h-4 w-4" />
                <span>Seller Dashboard</span>
              </Button>
            </Link>
          )}
          <Link href="/buyer/dashboard">
            <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-accent">
              <span>My Bids</span>
            </Button>
          </Link>
          {(user.role === "admin" || user.role === "seller_admin") && (
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-accent">
                <span>Admin</span>
              </Button>
            </Link>
          )}
        </>
      )}
    </>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2">
          <Link href="/">
            <div className="flex items-center gap-2">
              <img 
                src="/images/logo.png"
                alt="Pips 'n Chicks"
                className="h-8 w-auto object-contain"
              />
              <span className="hidden font-semibold sm:inline-block">
                Pips 'n Chicks
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-2 ml-4">
            <NavItems />
          </div>
        </div>

        {/* Right side - User menu and mobile trigger */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationsMenu 
                notifications={notifications} 
                onMarkAllRead={handleMarkAllRead}
              />

              <Link href="/profile">
                <Button 
                  variant={user.hasProfile ? "ghost" : "default"}
                  size="sm"
                  className={`hidden sm:flex items-center gap-2 ${!user.hasProfile ? "bg-primary text-primary-foreground" : ""}`}
                >
                  <UserCircle className="h-4 w-4" />
                  {user.hasProfile ? "Profile" : "Complete Profile"}
                </Button>
              </Link>

              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[240px] sm:w-[280px]">
                  <div className="flex flex-col gap-4 py-4">
                    <NavItems />
                    <Separator />
                    <Link href="/profile">
                      <Button 
                        variant={user.hasProfile ? "ghost" : "default"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <UserCircle className="mr-2 h-4 w-4" />
                        {user.hasProfile ? "Profile" : "Complete Profile"}
                      </Button>
                    </Link>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <Link href="/auth">
              <Button size="sm">Login / Register</Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
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