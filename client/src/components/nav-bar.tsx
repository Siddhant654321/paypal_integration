
import React, { useState } from "react";
import Link from "next/link";
import { LineChart, Bell, User, LogOut, Auction, Plus, Package } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Badge,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";

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

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="bg-accent p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/">
          <h2 className="text-2xl font-bold text-accent-foreground cursor-pointer">
            Pips 'n Chicks
          </h2>
        </Link>
        <div className="flex gap-4 items-center">
          {/* Main Navigation Links */}
          <div className="flex gap-3">
            <Link href="/auctions">
              <Button variant="ghost" className="flex items-center gap-2">
                <Auction className="h-4 w-4" />
                Browse Auctions
              </Button>
            </Link>
            
            <Link href="/analytics">
              <Button variant="ghost" className="flex items-center gap-2">
                <LineChart className="h-4 w-4" />
                Market Analytics
              </Button>
            </Link>
            
            {user && (
              <Link href="/new-auction">
                <Button variant="ghost" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Auction
                </Button>
              </Link>
            )}
            
            {user?.role === "admin" && (
              <Link href="/admin">
                <Button variant="ghost" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}
          </div>

          {/* User Account Section */}
          {user ? (
            <div className="flex gap-2">
              {/* Notifications Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex justify-between">
                    <span>Notifications</span>
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-xs"
                      onClick={handleMarkAllRead}
                    >
                      Mark all as read
                    </Button>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.map((notification) => (
                    <DropdownMenuItem
                      key={notification.id}
                      className={`flex flex-col items-start ${
                        !notification.read ? "bg-accent/50" : ""
                      }`}
                    >
                      <div className="font-medium">{notification.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleString()}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Account Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/profile">
                    <DropdownMenuItem>
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem onClick={() => logoutMutation.mutate()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link href="/login">
                <Button variant="ghost">Log in</Button>
              </Link>
              <Link href="/register">
                <Button>Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
