import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "./ui/loading-spinner";

const formSchema = z.object({
  carrier: z.string().min(2, "Carrier name must be at least 2 characters"),
  trackingNumber: z.string().min(4, "Please enter a valid tracking number"),
});

type FormData = z.infer<typeof formSchema>;

interface Props {
  onSubmit: (data: { carrier: string; trackingNumber: string }) => void;
  isPending?: boolean;
}

export function FulfillmentForm({ onSubmit, isPending = false }: Props) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      carrier: "",
      trackingNumber: "",
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
          name="carrier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipping Carrier</FormLabel>
              <FormControl>
                <Input placeholder="USPS, FedEx, UPS, etc." {...field} />
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
                <Input placeholder="Enter tracking number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button 
          type="submit" 
          disabled={isPending}
          className="w-full"
        >
          {isPending && <LoadingSpinner className="mr-2" />}
          {isPending ? "Submitting..." : "Submit Tracking Information"}
        </Button>
      </form>
    </Form>
  );
}