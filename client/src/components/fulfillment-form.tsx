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

interface FormData extends Omit<InsertFulfillment, 'auctionId'> {
  shippingDate: string;
  estimatedDeliveryDate?: string;
}

interface FulfillmentFormProps {
  onSubmit: (data: FormData) => void;
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

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="shippingCarrier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipping Carrier</FormLabel>
              <FormControl>
                <Input {...field} placeholder="USPS, FedEx, UPS, etc." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="trackingNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tracking Number</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter tracking number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shippingDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipping Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
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