import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  LogOut, 
  User as UserIcon, 
  Package, 
  Auction, 
  LineChart, 
  Plus, 
  Heart,
  History,
  UserCircle
} from "lucide-react";

export function NavBar() {
  const { user, logout } = useUser();

  return (
    <div className="bg-accent p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/">
          <a className="text-2xl font-bold text-accent-foreground cursor-pointer">
            Pips 'n Chicks
          </a>
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
              <>
                <Link href="/new-auction">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Auction
                  </Button>
                </Link>

                <Link href="/watchlist">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Watchlist
                  </Button>
                </Link>

                <Link href="/my-bids">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    My Bids
                  </Button>
                </Link>
              </>
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

          {/* User Menu */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="/default-avatar.png" alt={user.name} />
                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Link href="/profile">
                  <DropdownMenuItem>
                    <UserCircle className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex gap-2">
              <Link href="/login">
                <Button variant="outline">Log in</Button>
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