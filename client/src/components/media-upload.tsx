import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, X, Loader2 } from "lucide-react";

type MediaUploadProps = {
  onUpload: (urls: string[]) => void;
  defaultUrls?: string[];
};

export default function MediaUpload({ onUpload, defaultUrls = [] }: MediaUploadProps) {
  const [mediaUrls, setMediaUrls] = useState<string[]>(defaultUrls);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setIsUploading(true);
    const formData = new FormData();
    
    Array.from(files).forEach((file) => {
      formData.append("media", file);
    });

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload media");
      }

      const { urls } = await res.json();
      const newUrls = [...mediaUrls, ...urls];
      setMediaUrls(newUrls);
      onUpload(newUrls);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeMedia = (index: number) => {
    const newUrls = mediaUrls.filter((_, i) => i !== index);
    setMediaUrls(newUrls);
    onUpload(newUrls);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {mediaUrls.map((url, index) => (
          <div key={index} className="relative group">
            {url.toLowerCase().endsWith('.mp4') ? (
              <video
                src={url}
                className="w-full h-48 object-cover rounded-lg"
                controls
              />
            ) : (
              <img
                src={url}
                alt={`Upload ${index + 1}`}
                className="w-full h-48 object-cover rounded-lg"
              />
            )}
            <button
              onClick={() => removeMedia(index)}
              className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
          id="media-upload"
          disabled={isUploading}
        />
        <label htmlFor="media-upload">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={isUploading}
            asChild
          >
            <span>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ImagePlus className="mr-2 h-4 w-4" />
              Upload Media
            </span>
          </Button>
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload images or videos. At least one photo is required.
      </p>
    </div>
  );
}
