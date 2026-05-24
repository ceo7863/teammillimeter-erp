import React, { useEffect, useRef, useState } from "react";

function ErpInput({
  className = "",
  lang,
  type,
  inputMode,
  value,
  onChange,
  onCompositionStart,
  onCompositionEnd,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const isNumericField = type === "number" || type === "date" || inputMode === "numeric" || inputMode === "decimal";
  const composingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    if (!composingRef.current) setLocalValue(value ?? "");
  }, [value]);

  return (
    <input
      {...rest}
      type={type}
      inputMode={inputMode}
      value={localValue}
      lang={lang ?? (isNumericField ? undefined : "ko")}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => {
        setLocalValue(event.target.value);
        if (!composingRef.current) onChange?.(event);
      }}
      onCompositionStart={(event) => {
        composingRef.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        setLocalValue(event.currentTarget.value);
        onChange?.(event);
        onCompositionEnd?.(event);
      }}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

function isImeActive(event: React.KeyboardEvent) {
  return event.nativeEvent.isComposing || event.key === "Process" || event.keyCode === 229;
}

type OptionLike = string | { label?: string; name?: string; value?: string; manager?: string; phone?: string; [key: string]: unknown };

type AutocompleteInputProps = {
  value?: string;
  onChange: (value: string, raw?: unknown) => void;
  options?: OptionLike[];
  placeholder?: string;
  renderSub?: (raw: unknown) => React.ReactNode;
  inputProps?: Record<string, unknown>;
  limit?: number;
  freeSolo?: boolean;
  showOptionsOnFocus?: boolean;
};

export function AutocompleteInput({
  value,
  onChange,
  options = [],
  placeholder = "",
  renderSub,
  inputProps = {},
  limit = 12,
  freeSolo = true,
  showOptionsOnFocus,
}: AutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const openOnFocus = showOptionsOnFocus ?? !(inputProps as { excelGrid?: boolean }).excelGrid;

  const passthroughInputProps = Object.fromEntries(
    Object.entries(inputProps).filter(([key]) => !["onKeyDown", "excelGrid", "showOptionsOnFocus"].includes(key))
  );

  const normalizedOptions = options.map((item) =>
    typeof item === "string"
      ? { label: item, value: item, raw: item }
      : {
          label: item.label ?? item.name ?? String(item.value ?? ""),
          value: item.value ?? item.name ?? item.label ?? "",
          raw: item,
        }
  );

  const selectedOption = normalizedOptions.find((item) => item.value === value);
  const resolvedLabel = selectedOption?.label ?? String(value ?? "");

  useEffect(() => {
    if (!focused) setInputText(resolvedLabel);
  }, [resolvedLabel, focused]);

  const commitInputText = (nextText: string) => {
    setInputText(nextText);
    if (freeSolo) onChange(nextText);
    setHighlightedIndex(0);
  };

  const filtered = normalizedOptions
    .filter((item) => item.label.toLowerCase().includes(String(inputText || "").toLowerCase()))
    .sort((a, b) => {
      const query = String(inputText || "").toLowerCase();
      const aStarts = query && a.label.toLowerCase().startsWith(query);
      const bStarts = query && b.label.toLowerCase().startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.label.localeCompare(b.label, "ko-KR");
    })
    .slice(0, limit);

  const selectItem = (item: { label: string; value: string; raw: unknown }) => {
    setInputText(item.label);
    onChange(item.value, item.raw);
    setFocused(false);
  };

  const canShowDropdown = focused && filtered.length > 0 && (inputText.length > 0 || openOnFocus);
  const canPickFromDropdown = canShowDropdown && inputText.length > 0;

  return (
    <div className="relative">
      <ErpInput
        value={inputText}
        onChange={(e) => commitInputText(e.target.value)}
        placeholder={placeholder}
        lang="ko"
        inputMode="text"
        onFocus={() => {
          setFocused(true);
          setHighlightedIndex(0);
        }}
        onBlur={() => {
          setTimeout(() => {
            setFocused(false);
            if (!freeSolo) setInputText(resolvedLabel);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (isImeActive(e)) return;

          const dropdownUsesVerticalKeys = canPickFromDropdown;

          if (dropdownUsesVerticalKeys && e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % filtered.length);
            return;
          }

          if (dropdownUsesVerticalKeys && e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
            return;
          }

          if (canPickFromDropdown && e.key === "Enter") {
            e.preventDefault();
            selectItem(filtered[highlightedIndex] || filtered[0]);
            return;
          }

          if (canPickFromDropdown && e.key === "Tab") {
            selectItem(filtered[highlightedIndex] || filtered[0]);
            return;
          }

          (inputProps.onKeyDown as ((event: React.KeyboardEvent<HTMLInputElement>) => void) | undefined)?.(e);
        }}
        {...passthroughInputProps}
      />

      {canShowDropdown && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border bg-white shadow-xl">
          {filtered.map((item, index) => (
            <button
              key={`${item.value}-${index}`}
              type="button"
              className={`w-full border-b px-4 py-3 text-left hover:bg-slate-50 ${highlightedIndex === index ? "bg-slate-50" : ""}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(item);
              }}
            >
              <div className="font-semibold text-slate-900">{item.label}</div>
              {renderSub && <div className="erp-text-caption mt-1 text-slate-500">{renderSub(item.raw)}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type AutocompleteSelectProps = {
  value?: string;
  onChange: (value: string, raw?: unknown) => void;
  options?: OptionLike[];
  placeholder?: string;
  renderSub?: (raw: unknown) => React.ReactNode;
  inputProps?: Record<string, unknown>;
};

export function AutocompleteSelect({ value, onChange, options, placeholder = "선택", renderSub, inputProps = {} }: AutocompleteSelectProps) {
  return (
    <AutocompleteInput
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      renderSub={renderSub}
      freeSolo={false}
      showOptionsOnFocus
      limit={8}
      inputProps={inputProps}
    />
  );
}
