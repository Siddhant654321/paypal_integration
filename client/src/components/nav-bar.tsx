import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2, UserCircle } from "lucide-react";

export default function NavBar() {
  const { user, logoutMutation } = useAuth();

  return (
    <div className="bg-accent p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/">
          <h2 className="text-2xl font-bold text-accent-foreground cursor-pointer">
            Pips 'n Chicks
          </h2>
        </Link>
        <div className="flex gap-4 items-center">
          {user ? (
            <>
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