
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";

// Simplified schema for fulfillment form
const fulfillmentFormSchema = z.object({
  carrier: z.string().min(2, "Carrier name is required"),
  trackingNumber: z.string().min(4, "Valid tracking number is required"),
  notes: z.string().optional()
});

type FulfillmentFormValues = z.infer<typeof fulfillmentFormSchema>;

interface FulfillmentFormProps {
  onSubmit: (data: FulfillmentFormValues) => void;
  isPending?: boolean;
}

export function FulfillmentForm({ onSubmit, isPending }: FulfillmentFormProps) {
  const form = useForm<FulfillmentFormValues>({
    resolver: zodResolver(fulfillmentFormSchema),
    defaultValues: {
      carrier: "",
      trackingNumber: "",
      notes: ""
    },
  });

  const handleSubmit = (data: FulfillmentFormValues) => {
    console.log("Submitting fulfillment data:", data);
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6 overflow-auto max-h-[70vh] px-1 pb-4"
      >
        <FormField
          control={form.control}
          name="carrier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipping Carrier</FormLabel>
              <FormControl>
                <Input placeholder="USPS, FedEx, UPS, etc." {...field} />
              </FormControl>
              <FormDescription>
                Enter the name of the shipping carrier you used
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
              <FormLabel>Tracking Number</FormLabel>
              <FormControl>
                <Input placeholder="Enter tracking number" {...field} />
              </FormControl>
              <FormDescription>
                Enter the tracking number provided by the carrier
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Any additional shipping details or notes for the buyer" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Shipping Details"
          )}
        </Button>
      </form>
    </Form>
  );
}
