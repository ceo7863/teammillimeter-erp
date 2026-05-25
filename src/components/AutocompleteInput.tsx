import React, { useEffect, useRef, useState } from "react";
import {
  filterAutocompleteOptions,
  mapAutocompleteOptions,
} from "@/utils/autocompleteFilter";

function ErpInput({
  className = "",
  lang,
  type,
  inputMode,
  value,
  onChange,
  onLiveValueChange,
  onCompositionStart,
  onCompositionEnd,
  onCompositionUpdate,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  onLiveValueChange?: (value: string) => void;
}) {
  const isNumericField = type === "number" || type === "date" || inputMode === "numeric" || inputMode === "decimal";
  const composingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    if (!composingRef.current) setLocalValue(value ?? "");
  }, [value]);

  const emitLiveValue = (nextValue: string) => {
    onLiveValueChange?.(nextValue);
  };

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
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        emitLiveValue(nextValue);
        if (!composingRef.current) onChange?.(event);
      }}
      onCompositionStart={(event) => {
        composingRef.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionUpdate={(event) => {
        const nextValue = event.currentTarget.value;
        setLocalValue(nextValue);
        emitLiveValue(nextValue);
        onCompositionUpdate?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const nextValue = event.currentTarget.value;
        setLocalValue(nextValue);
        emitLiveValue(nextValue);
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
  compact?: boolean;
};

function resolveAutocompleteInputClassName(inputProps: Record<string, unknown>, compact: boolean) {
  const customClass = String(inputProps.className ?? "").trim();
  if (!compact) return customClass;
  if (customClass.includes("erp-input-compact")) return customClass;
  return ["erp-input-compact", customClass].filter(Boolean).join(" ");
}

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
  compact = true,
}: AutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const openOnFocus = showOptionsOnFocus ?? !(inputProps as { excelGrid?: boolean }).excelGrid;

  const passthroughInputProps = Object.fromEntries(
    Object.entries(inputProps).filter(([key]) => !["onKeyDown", "excelGrid", "showOptionsOnFocus", "onLiveValueChange", "className"].includes(key))
  );
  const resolvedInputClassName = resolveAutocompleteInputClassName(inputProps, compact !== false);
  const useCompactMenu = compact !== false;

  const normalizedOptions = mapAutocompleteOptions(options);

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

  const syncFilterText = (nextText: string) => {
    setInputText(nextText);
    setHighlightedIndex(0);
  };

  const filtered = filterAutocompleteOptions(normalizedOptions, inputText, {
    limit,
    allowEmpty: openOnFocus,
  });

  const selectItem = (item: { label: string; value: string; raw: unknown }) => {
    setInputText(item.label);
    onChange(item.value, item.raw);
    setFocused(false);
  };

  const clearOption = normalizedOptions.find(
    (item) => item.value === "" || item.label === "전체" || item.value === "전체"
  );

  const commitClearedSelection = () => {
    if (clearOption) {
      selectItem(clearOption);
      return;
    }
    setInputText("");
    onChange("");
    setFocused(false);
  };

  const canShowDropdown = focused && filtered.length > 0 && (inputText.trim().length > 0 || openOnFocus);
  const canPickFromDropdown = canShowDropdown && inputText.trim().length > 0;

  return (
    <div className="relative">
      <ErpInput
        value={inputText}
        onLiveValueChange={syncFilterText}
        onChange={(e) => commitInputText(e.target.value)}
        placeholder={placeholder}
        lang="ko"
        inputMode="text"
        className={resolvedInputClassName}
        onFocus={() => {
          setFocused(true);
          setHighlightedIndex(0);
        }}
        onBlur={() => {
          setTimeout(() => {
            setFocused(false);
            if (!freeSolo) {
              if (!inputText.trim()) commitClearedSelection();
              else setInputText(resolvedLabel);
            }
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

          if (e.key === "Enter") {
            if (canPickFromDropdown) {
              e.preventDefault();
              selectItem(filtered[highlightedIndex] || filtered[0]);
              return;
            }
            if (!freeSolo && !inputText.trim()) {
              e.preventDefault();
              commitClearedSelection();
              return;
            }
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
        <div
          className={`erp-autocomplete-menu absolute z-50 w-full overflow-y-auto border bg-white ${
            useCompactMenu ? "erp-autocomplete-menu--compact" : "mt-1 max-h-64 rounded-2xl shadow-xl"
          }`}
        >
          {filtered.map((item, index) => (
            <button
              key={`${item.value}-${index}`}
              type="button"
              className={`erp-autocomplete-option w-full border-b text-left hover:bg-slate-50 ${
                useCompactMenu ? "erp-autocomplete-option--inline" : ""
              } ${highlightedIndex === index ? "bg-slate-50" : ""}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(item);
              }}
            >
              <div className="erp-autocomplete-option-label">{item.label}</div>
              {renderSub && <div className="erp-autocomplete-option-sub">{renderSub(item.raw)}</div>}
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
  compact?: boolean;
};

export function AutocompleteSelect({
  value,
  onChange,
  options,
  placeholder = "선택",
  renderSub,
  inputProps = {},
  compact = true,
}: AutocompleteSelectProps) {
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
      compact={compact}
      inputProps={inputProps}
    />
  );
}
