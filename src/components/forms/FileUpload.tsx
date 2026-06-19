import { Upload, X, FileIcon } from "lucide-react";
import { useRef } from "react";

export interface PickedFile {
  name: string;
  size: number;
  type: string;
  file: File;
}

export function FileUpload({
  files,
  onChange,
  maxFiles,
  maxSizeMB,
  accept,
}: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  maxFiles: number;
  maxSizeMB: number;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const handleAdd = (list: FileList | null) => {
    if (!list) return;
    const next: PickedFile[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= maxFiles) break;
      if (f.size > maxSizeMB * 1024 * 1024) continue;
      next.push({ name: f.name, size: f.size, type: f.type });
    }
    onChange(next);
    if (ref.current) ref.current.value = "";
  };

  return (
    <div className="space-y-2">
      <label className="flex flex-col items-center justify-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-input hover:border-primary/50 hover:bg-muted/40 transition py-6 px-4 text-center">
        <Upload className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm font-medium">Clique para selecionar arquivos</div>
        <div className="text-xs text-muted-foreground">
          Até {maxFiles} arquivo{maxFiles > 1 ? "s" : ""} · {maxSizeMB}MB cada
        </div>
        <input
          ref={ref}
          type="file"
          className="hidden"
          multiple={maxFiles > 1}
          accept={accept}
          onChange={(e) => handleAdd(e.target.files)}
        />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
            >
              <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground">
                {(f.size / 1024 / 1024).toFixed(2)}MB
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
