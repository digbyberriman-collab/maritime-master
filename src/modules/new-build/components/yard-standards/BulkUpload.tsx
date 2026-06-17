import { useState, useCallback } from "react";
import { supabase } from "@/modules/new-build/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, Sparkles, X, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  parseYardStandardNumber,
  MATERIAL_CODES,
  DOC_TYPE_CODES,
  type ParsedYardStandard,
} from "@/modules/new-build/lib/yard-standard-naming";

const CATEGORIES = [
  "General", "100 Build Standards", "Structural", "Outfitting", "Mechanical", "Electrical",
  "HVAC", "Piping", "Paint & Coatings", "Safety", "Quality Control",
  "Welding", "Insulation", "Joinery", "Deck Equipment", "Navigation",
];

interface BulkItem {
  file: File;
  title: string;
  category: string;
  tags: string;
  description: string;
  parsed: ParsedYardStandard | null;
}

interface BulkUploadProps {
  projectId: string;
  userId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function BulkUpload({ projectId, userId, onComplete, onCancel }: BulkUploadProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<BulkItem[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Parse filenames using Oceanco naming scheme
    const newItems: BulkItem[] = fileArray.map((f) => {
      const parsed = parseYardStandardNumber(f.name);
      return {
        file: f,
        title: parsed
          ? parsed.document_number
          : f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
        category: "General",
        tags: "",
        description: "",
        parsed,
      };
    });

    setItems(newItems);

    // Only call AI for files that didn't match the naming scheme
    const unmatchedFiles = newItems.filter((i) => !i.parsed);
    if (unmatchedFiles.length === 0) return;

    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-yard-metadata", {
        body: { filenames: unmatchedFiles.map((i) => i.file.name) },
      });

      if (error) throw error;

      const results = data?.results || [];
      if (results.length > 0) {
        setItems((prev) =>
          prev.map((item) => {
            if (item.parsed) return item; // Already parsed via naming scheme
            const match = results.find((r: any) => r.filename === item.file.name);
            if (match) {
              return {
                ...item,
                title: match.title || item.title,
                category: CATEGORIES.includes(match.category) ? match.category : "General",
                tags: match.tags || "",
                description: match.description || "",
              };
            }
            return item;
          })
        );
      }
    } catch (err) {
      console.error("AI extraction failed, using filename-based defaults:", err);
    } finally {
      setExtracting(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const updateItem = (index: number, field: keyof BulkItem, value: string) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (items.length === 0) return;
    setUploading(true);
    setProgress(0);

    let uploaded = 0;
    let errors = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const path = `${projectId}/${Date.now()}-${item.file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("yard-standards")
          .upload(path, item.file);
        if (uploadErr) throw uploadErr;

        const record: any = {
          title: item.title.trim(),
          description: item.description.trim() || null,
          category: item.category,
          tags: item.tags.trim() || null,
          file_name: item.file.name,
          storage_path: path,
          project_id: projectId,
          uploaded_by: userId,
        };

        // Include structured naming fields if parsed
        if (item.parsed) {
          record.document_number = item.parsed.document_number;
          record.doc_type_code = item.parsed.doc_type_code;
          record.element_code = item.parsed.element_code;
          record.material_code = item.parsed.material_code;
          record.seq_code = item.parsed.seq_code;
          record.sheet_number = item.parsed.sheet_number;
          record.revision = item.parsed.revision;
        }

        const { data: insertData, error: insertErr } = await (supabase
          .from("yard_standards" as any)
          .insert(record)
          .select("id")
          .single() as any);
        if (insertErr) throw insertErr;

        // Fire-and-forget indexing for content search
        if (insertData?.id) {
          supabase.functions.invoke("index-yard-standard", {
            body: { yard_standard_id: insertData.id },
          }).catch((err: any) => console.warn("Background indexing failed:", err));
        }

        uploaded++;
      } catch (err) {
        console.error(`Failed to upload ${item.file.name}:`, err);
        errors++;
      }
      setProgress(Math.round(((i + 1) / items.length) * 100));
    }

    setUploading(false);
    toast({
      title: `Uploaded ${uploaded} standards${errors > 0 ? `, ${errors} failed` : ""}`,
    });
    onComplete();
  };

  const parsedCount = items.filter((i) => i.parsed).length;

  // Drop zone (no files selected yet)
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("bulk-file-input")?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">
              Drop multiple files here for bulk upload
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse — select as many files as you need
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Files matching Oceanco naming (e.g. S-323-04-001-01A.pdf) will be auto-parsed.
              Others will use AI to extract metadata.
            </p>
            <input
              id="bulk-file-input"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.png,.jpeg"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Preview & edit table
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {items.length} files ready to upload
          </h2>
          {parsedCount > 0 && (
            <Badge variant="default" className="gap-1">
              {parsedCount} matched naming scheme
            </Badge>
          )}
          {extracting && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3 animate-pulse" />
              AI extracting metadata…
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => document.getElementById("bulk-file-input-more")?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-2" /> Add More
          </Button>
          <input
            id="bulk-file-input-more"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.png,.jpeg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                const newFiles = Array.from(e.target.files);
                handleFiles([...items.map((i) => i.file), ...newFiles]);
              }
            }}
          />
        </div>
      </div>

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground text-center">
            Uploading… {progress}%
          </p>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Doc Number</TableHead>
                <TableHead className="w-[25%]">Title</TableHead>
                <TableHead className="w-[100px]">Material</TableHead>
                <TableHead className="w-[15%]">Category</TableHead>
                <TableHead className="w-[15%]">Tags</TableHead>
                <TableHead className="w-[60px]">File</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {item.parsed ? (
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {item.parsed.document_number}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No match
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.title}
                      onChange={(e) => updateItem(i, "title", e.target.value)}
                      className="h-8 text-sm"
                      disabled={uploading}
                    />
                  </TableCell>
                  <TableCell>
                    {item.parsed ? (
                      <span className="text-xs">
                        {MATERIAL_CODES[item.parsed.material_code] || item.parsed.material_code}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.category}
                      onValueChange={(v) => updateItem(i, "category", v)}
                      disabled={uploading}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.tags}
                      onChange={(e) => updateItem(i, "tags", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="tag1, tag2"
                      disabled={uploading}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground truncate block max-w-[80px]" title={item.file.name}>
                      {item.file.name.split(".").pop()?.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeItem(i)}
                      disabled={uploading}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel} disabled={uploading}>
          Cancel
        </Button>
        <Button
          onClick={handleUploadAll}
          disabled={uploading || extracting || items.length === 0}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" /> Upload {items.length} Standards
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
