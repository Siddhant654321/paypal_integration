import { BuyerRequestForm } from "@/components/buyer-request-form";
import { BuyerRequestList } from "@/components/buyer-request-list";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function BuyerRequestsPage() {
  const { user } = useAuth();
  
  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Buyer Requests</h1>
          <p className="text-muted-foreground mt-2">
            Browse requests from buyers looking for specific breeds or varieties
          </p>
        </div>
        
        {user && user.role === "buyer" && (
          <Sheet>
            <SheetTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle>Create a New Request</SheetTitle>
              </SheetHeader>
              <div className="mt-6 overflow-y-auto max-h-[calc(100vh-120px)] pr-2">
                <BuyerRequestForm />
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <BuyerRequestList />
    </div>
  );
}
