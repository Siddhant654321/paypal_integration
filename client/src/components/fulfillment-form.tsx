import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFulfillmentSchema } from "@shared/schema";
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
//import { ScrollArea } from "@/components/ui/scroll-area"; //Removed ScrollArea import

interface FormData {
  shippingCarrier: string;
  trackingNumber: string;
}

interface FulfillmentFormProps {
  onSubmit: (data: { carrier: string; trackingNumber: string }) => void;
  isPending?: boolean;
}

export function FulfillmentForm({ onSubmit, isPending }: FulfillmentFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(
      insertFulfillmentSchema
        .pick({ shippingCarrier: true, trackingNumber: true })
        .extend({
          shippingCarrier: insertFulfillmentSchema.shape.shippingCarrier
            .min(2, "Please enter a valid carrier name"),
          trackingNumber: insertFulfillmentSchema.shape.trackingNumber
            .min(4, "Please enter a valid tracking number")
        })
    ),
    defaultValues: {
      shippingCarrier: "",
      trackingNumber: "",
    },
  });

  const handleSubmit = (data: FormData) => {
    console.log("Submitting fulfillment data:", data);
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