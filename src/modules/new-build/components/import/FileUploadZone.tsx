import { useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface FileUploadZoneProps {
  onParsed: (fileName: string, headers: string[], rows: string[][]) => void;
}

export function FileUploadZone({ onParsed }: FileUploadZoneProps) {
  const { toast } = useToast();

  const parseFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || ext === "tsv" || ext === "txt") {
      Papa.parse(file, {
        complete: (result) => {
          const data = result.data as string[][];
          if (data.length < 2) {
            toast({ title: "File is empty or has no data rows", variant: "destructive" });
            return;
          }
          onParsed(file.name, data[0], data.slice(1).filter((r) => r.some((c) => c?.trim())));
        },
        error: () => toast({ title: "Failed to parse CSV", variant: "destructive" }),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (data.length < 2) {
            toast({ title: "File is empty or has no data rows", variant: "destructive" });
            return;
          }
          const headers = data[0].map(String);
          const rows = data.slice(1)
            .filter((r) => r.some((c) => c != null && String(c).trim()))
            .map((r) => r.map(String));
          onParsed(file.name, headers, rows);
        } catch {
          toast({ title: "Failed to parse Excel file", variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({ title: "Unsupported format. Use CSV or Excel (.xlsx)", variant: "destructive" });
    }
  }, [toast, onParsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  return (
    <Card>
      <CardContent className="py-12">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop a CSV or Excel file here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
          <p className="text-xs text-muted-foreground mt-2">Supports MS Project, Primavera P6, and other schedule exports</p>
          <input id="file-input" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
        </div>
      </CardContent>
    </Card>
  );
}
