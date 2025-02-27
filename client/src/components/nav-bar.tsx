import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";

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
        <div className="flex gap-4">
          {user ? (
            <>
              <span className="text-accent-foreground">
                Welcome, {user.username}!
              </span>
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
              <Button 
                variant="secondary" 
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Logout
              </Button>
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
