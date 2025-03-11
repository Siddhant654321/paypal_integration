import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFulfillmentSchema, type InsertFulfillment } from "@shared/schema";
import { Loader2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FormData {
  shippingCarrier: string;
  trackingNumber: string;
  shippingDate: string;
  estimatedDeliveryDate?: string;
  additionalNotes?: string;
}

interface FulfillmentFormProps {
  onSubmit: (data: { carrier: string; trackingNumber: string }) => void;
  isPending?: boolean;
}

export function FulfillmentForm({ onSubmit, isPending }: FulfillmentFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(
      insertFulfillmentSchema
        .omit({ auctionId: true })
        .extend({
          shippingDate: insertFulfillmentSchema.shape.shippingDate,
          estimatedDeliveryDate: insertFulfillmentSchema.shape.estimatedDeliveryDate.optional(),
        })
    ),
    defaultValues: {
      shippingCarrier: "",
      trackingNumber: "",
      shippingDate: new Date().toISOString().split('T')[0],
      additionalNotes: "",
    },
  });

  const handleSubmit = (data: FormData) => {
    onSubmit({
      carrier: data.shippingCarrier,
      trackingNumber: data.trackingNumber
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="shippingCarrier"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1">
                  Shipping Carrier
                  <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="USPS, FedEx, UPS, etc." />
                </FormControl>
                <FormDescription>
                  Enter the carrier that will deliver the package
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="trackingNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1">
                  Tracking Number
                  <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter tracking number" />
                </FormControl>
                <FormDescription>
                  The tracking number provided by the shipping carrier
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="shippingDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1">
                  Shipping Date
                  <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>
                  The date the package was or will be shipped
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estimatedDeliveryDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Delivery Date (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="date" 
                    {...field} 
                    value={field.value || ''} 
                  />
                </FormControl>
                <FormDescription>
                  If provided by the shipping carrier
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="additionalNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additional Notes (Optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Any special handling instructions or notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
        >
          {isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Submit Shipping Details
        </Button>
      </form>
    </Form>
  );
}