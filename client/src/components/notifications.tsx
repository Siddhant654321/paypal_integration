import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "bid" | "auction" | "admin" | "payment";
  message: string;
  read: boolean;
  createdAt: string;
}

export function NotificationsMenu({ notifications = [] }: { notifications?: Notification[] }) {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
              <span className="text-[10px] font-medium text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={cn(
                "flex flex-col items-start gap-1 p-4",
                !notification.read && "bg-accent/50"
              )}
            >
              <div className="flex w-full justify-between gap-4">
                <span className="font-medium leading-none">
                  {notification.message}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs",
                    notification.type === "bid" && "text-green-500",
                    notification.type === "auction" && "text-blue-500",
                    notification.type === "admin" && "text-red-500",
                    notification.type === "payment" && "text-yellow-500"
                  )}
                >
                  {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
