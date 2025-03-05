import { Auction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  Input,
  Textarea,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  ScrollArea,
} from "@/components/ui/";
import { FileUpload } from "@/components/file-upload";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import { insertAuctionSchema } from "@shared/schema";
import * as z from "zod";

export function EditAuctionDialog({ auction, onClose }: { auction: Auction; onClose?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  console.log("[EditAuction] Initializing form with auction:", {
    id: auction.id,
    species: auction.species,
    currentImages: auction.images,
    imageUrl: auction.imageUrl
  });

  const form = useForm<z.infer<typeof insertAuctionSchema>>({
    resolver: zodResolver(insertAuctionSchema),
    defaultValues: {
      title: auction.title,
      description: auction.description,
      species: auction.species,
      category: auction.category,
      startPrice: auction.startPrice,
      reservePrice: auction.reservePrice,
      startDate: new Date(auction.startDate),
      endDate: new Date(auction.endDate),
      imageUrl: auction.imageUrl || undefined,
      images: auction.images || [],
    },
  });

  const updateAuctionMutation = useMutation({
    mutationFn: async (values: any) => {
      console.log("[EditAuction] Updating auction with values:", values);
      return await apiRequest("PATCH", `/api/admin/auctions/${auction.id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctions"] });
      toast({
        title: "Success",
        description: "Auction updated successfully",
      });
      if (onClose) onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to update auction: " + error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Auction</DialogTitle>
          <DialogDescription>
            Update the auction details below.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(values => updateAuctionMutation.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="species"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Species</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select species" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bantam">Bantam</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="waterfowl">Waterfowl</SelectItem>
                        <SelectItem value="quail">Quail</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Show Quality">Show Quality</SelectItem>
                        <SelectItem value="Purebred & Production">Purebred & Production</SelectItem>
                        <SelectItem value="Fun & Mixed">Fun & Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Price</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reservePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reserve Price</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Images</Label>
              {form.watch("images")?.length > 0 && (
                <div className="mb-4">
                  <Label>Current Images</Label>
                  <ScrollArea className="h-32 w-full rounded-md border">
                    <div className="flex gap-2 p-2">
                      {form.watch("images").map((url: string, index: number) => (
                        <div key={url} className="relative">
                          <img
                            src={url}
                            alt={`Auction image ${index + 1}`}
                            className="h-24 w-24 rounded-md object-cover"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -right-2 -top-2 h-6 w-6"
                            onClick={() => {
                              const currentImages = form.watch("images") || [];
                              const newImages = currentImages.filter((_, i) => i !== index);
                              form.setValue("images", newImages);

                              if (form.watch("imageUrl") === url) {
                                form.setValue("imageUrl", newImages[0] || "");
                              }
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="grid gap-4">
                <FileUpload
                  value={form.watch("images")}
                  onChange={(urls) => {
                    console.log("[EditAuction] New images uploaded:", urls);
                    const currentImages = form.watch("images") || [];
                    const newImages = [...currentImages, ...urls];
                    form.setValue("images", newImages);

                    if (!form.watch("imageUrl")) {
                      form.setValue("imageUrl", newImages[0]);
                    }
                  }}
                  onRemove={(index) => {
                    const currentImages = form.watch("images") || [];
                    const newImages = currentImages.filter((_, i) => i !== index);
                    form.setValue("images", newImages);

                    if (form.watch("imageUrl") === currentImages[index]) {
                      form.setValue("imageUrl", newImages[0] || "");
                    }
                  }}
                  accept="image/*"
                  maxFiles={5}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={updateAuctionMutation.isPending}>
                {updateAuctionMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default EditAuctionDialog;
