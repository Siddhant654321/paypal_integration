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
import type { Notification } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface NotificationsMenuProps {
  notifications?: Notification[];
  onMarkAllRead?: () => void;
}

export function NotificationsMenu({ 
  notifications = [],
  onMarkAllRead
}: NotificationsMenuProps) {
  const queryClient = useQueryClient();
  const unreadCount = notifications.filter(n => !n.read).length;

  // Add mutation for marking a single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      await apiRequest("POST", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      // Refetch notifications after marking as read
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }
  });

  // Add mutation for marking all notifications as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      // Refetch notifications after marking all as read
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onMarkAllRead?.();
    }
  });

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
        <div className="flex items-center justify-between p-2">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="text-xs hover:bg-accent"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex flex-col items-start gap-1 p-4 cursor-pointer",
                  !notification.read && "bg-accent/50"
                )}
                onClick={() => markAsReadMutation.mutate(notification.id)}
              >
                <div className="flex w-full justify-between gap-4">
                  <span className="font-medium leading-none">
                    {notification.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(notification.createdAt!).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {notification.message}
                </p>
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
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}