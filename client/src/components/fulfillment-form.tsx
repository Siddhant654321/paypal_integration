import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from './ui/loading-spinner';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const fulfillmentSchema = z.object({
  carrier: z.string().min(2, 'Carrier is required'),
  trackingNumber: z.string().min(5, 'Valid tracking number is required'),
  notes: z.string().optional(),
});

type FulfillmentFormProps = {
  auctionId: number;
  onSuccess?: () => void;
};

export function FulfillmentForm({ auctionId, onSuccess }: FulfillmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof fulfillmentSchema>>({
    resolver: zodResolver(fulfillmentSchema),
    defaultValues: {
      carrier: '',
      trackingNumber: '',
      notes: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof fulfillmentSchema>) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      console.log('Submitting fulfillment data:', data);

      const response = await fetch(`/api/auctions/${auctionId}/fulfill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || 'Failed to submit fulfillment details');
      }

      setSubmitSuccess(true);

      toast({
        title: 'Fulfillment Details Submitted',
        description: 'Tracking information has been sent to the buyer and your payout is being processed.',
      });

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      console.error('Error submitting fulfillment details:', error);
      setSubmitError(error instanceof Error ? error.message : 'An error occurred during submission');
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'An error occurred during submission',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle className="h-5 w-5 text-green-600" />
        <AlertTitle className="text-green-800">Success!</AlertTitle>
        <AlertDescription className="text-green-700">
          Your tracking information has been submitted. The buyer has been notified and your payout is being processed.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

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

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Any special shipping instructions or details" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? <LoadingSpinner className="mr-2" /> : null}
          {isSubmitting ? 'Submitting...' : 'Submit Tracking Information'}
        </Button>
      </form>
    </Form>
  );
}