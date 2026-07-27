import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { inputCls } from "./FormShell";

export type SearchableOption = { value: string; label: string };

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Combobox acessível: preserva a seleção por lista (como o <select> anterior)
 * e permite digitar para localizar a opção desejada.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  disabled,
  required,
  invalid,
  emptyLabel = "Nenhum resultado encontrado.",
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  const pick = (opt: SearchableOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputCls + " pr-8 cursor-text"}
        value={open ? query : selected?.label ?? ""}
        placeholder={selected ? selected.label : placeholder}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-expanded={open}
        role="combobox"
        aria-controls="searchable-listbox"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            const opt = filtered[highlight];
            if (opt) pick(opt);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          className="sr-only absolute h-0 w-0 opacity-0"
        />
      )}
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      {open && !disabled && (
        <ul
          id="searchable-listbox"
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {filtered.length === 0 && (
            <li className="px-2 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
          )}
          {filtered.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(o)}
                className={
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition " +
                  (i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent")
                }
              >
                <Check
                  className={
                    "h-3.5 w-3.5 shrink-0 " + (o.value === value ? "opacity-100" : "opacity-0")
                  }
                />
                <span className="min-w-0 truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
