import React, { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface FileUploadProps {
  multiple?: boolean;
  onFilesChange: (files: File[]) => void;
  accept?: string;
  maxFiles?: number;
  previewUrls?: string[];
}

export function FileUpload({
  multiple = false,
  onFilesChange,
  accept = "image/*",
  maxFiles = 5,
  previewUrls = [],
}: FileUploadProps) {
  const [previews, setPreviews] = useState<string[]>(previewUrls);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const selectedFiles = Array.from(e.target.files);

    // Limit number of files
    if (multiple && (previews.length + selectedFiles.length > maxFiles)) {
      alert(`You can upload a maximum of ${maxFiles} files.`);
      return;
    }

    // Create preview URLs
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));

    // Update state
    if (multiple) {
      setPreviews(prev => [...prev, ...newPreviews]);
      onFilesChange(selectedFiles);
    } else {
      // For single file upload, replace existing preview
      if (previews.length > 0) {
        previews.forEach(url => URL.revokeObjectURL(url));
      }
      setPreviews([newPreviews[0]]);
      onFilesChange([selectedFiles[0]]);
    }
  };

  const removeFile = (index: number) => {
    const newPreviews = [...previews];
    const removedFileUrl = newPreviews[index];
    URL.revokeObjectURL(removedFileUrl);
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);

    //Correctly update files array with remaining files
    const remainingFiles = fileInputRef.current?.files;
    if(remainingFiles){
        onFilesChange(Array.from(remainingFiles));
    } else {
        onFilesChange([]);
    }

  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          {multiple ? "Upload Images" : "Upload Image"}
        </Button>
        {previews.length > 0 && multiple && (
          <span className="text-sm text-muted-foreground">
            {previews.length} {previews.length === 1 ? "file" : "files"} selected
          </span>
        )}
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
          {previews.map((preview, index) => (
            <div key={index} className="relative group">
              <img
                src={preview}
                alt={`Preview ${index + 1}`}
                className="w-full h-24 object-cover rounded-md"
              />
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 
                          opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}