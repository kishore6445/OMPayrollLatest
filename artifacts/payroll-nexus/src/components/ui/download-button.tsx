import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, Loader2, ChevronDown, FileText, Table } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DownloadFormat {
  label: string;
  format: string;
  icon?: ReactNode;
}

interface DownloadButtonProps {
  label?: string;
  formats?: DownloadFormat[];
  onDownload: (format: string) => Promise<void>;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
  disabled?: boolean;
}

const DEFAULT_FORMATS: DownloadFormat[] = [
  { label: "Download CSV", format: "csv", icon: <Table className="h-3.5 w-3.5" /> },
  { label: "Download PDF", format: "pdf", icon: <FileText className="h-3.5 w-3.5" /> },
];

export function DownloadButton({ label = "Export", formats = DEFAULT_FORMATS, onDownload, size = "sm", variant = "outline", disabled }: DownloadButtonProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDownload = async (format: string) => {
    setLoading(format);
    try {
      await onDownload(format);
      toast({ title: "Export started", description: `${format.toUpperCase()} download initiated` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  if (formats.length === 1) {
    return (
      <Button size={size} variant={variant} disabled={disabled || !!loading} onClick={() => handleDownload(formats[0].format)}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} disabled={disabled || !!loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          {label}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((f) => (
          <DropdownMenuItem key={f.format} className="text-xs gap-2" onClick={() => handleDownload(f.format)}>
            {f.icon}{f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
