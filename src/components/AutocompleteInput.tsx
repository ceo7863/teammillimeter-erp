import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type BufferedTextFieldProps = {
  value?: string;
  onDraftChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  className?: string;
  placeholder?: string;
};

function useBufferedTextFieldState(
  value: string | undefined,
  onDraftChange?: (value: string) => void,
  onCommit?: (value: string) => void,
) {
  const composingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    if (!composingRef.current) setLocalValue(value ?? "");
  }, [value]);

  const emitValue = (nextValue: string, commit: boolean) => {
    setLocalValue(nextValue);
    onDraftChange?.(nextValue);
    if (commit) onCommit?.(nextValue);
  };

  return { composingRef, localValue, emitValue };
}

/** Text input that buffers keystrokes locally so parent state does not re-render on every key. */
export function BufferedTextInput({
  value = "",
  onDraftChange,
  onCommit,
  className = "",
  placeholder,
}: BufferedTextFieldProps) {
  const { composingRef, localValue, emitValue } = useBufferedTextFieldState(value, onDraftChange, onCommit);

  return (
    <input
      lang="ko"
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
      value={localValue}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => emitValue(event.target.value, !composingRef.current)}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionUpdate={(event) => {
        emitValue(event.currentTarget.value, false);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        emitValue(event.currentTarget.value, true);
      }}
    />
  );
}

/** Multiline memo field with the same buffered typing behavior as BufferedTextInput. */
export function BufferedTextarea({
  value = "",
  onDraftChange,
  onCommit,
  className = "",
  placeholder,
}: BufferedTextFieldProps) {
  const { composingRef, localValue, emitValue } = useBufferedTextFieldState(value, onDraftChange, onCommit);

  return (
    <textarea
      lang="ko"
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
      value={localValue}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => emitValue(event.target.value, !composingRef.current)}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionUpdate={(event) => {
        emitValue(event.currentTarget.value, false);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        emitValue(event.currentTarget.value, true);
      }}
    />
  );
}

const UNCONTROLLED_TEXTAREA_CLASS =
  "erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3";

const UNCONTROLLED_INPUT_CLASS =
  "erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3";

/** Memo/notes field with zero React re-renders while typing — value lives in a ref only. */
export const UncontrolledBufferedTextarea = React.memo(function UncontrolledBufferedTextarea({
  defaultValue = "",
  draftRef,
  className = "",
  placeholder,
}: {
  defaultValue?: string;
  draftRef: React.MutableRefObject<string>;
  className?: string;
  placeholder?: string;
}) {
  const composingRef = useRef(false);

  useEffect(() => {
    draftRef.current = defaultValue;
  }, [defaultValue, draftRef]);

  const syncDraft = (nextValue: string) => {
    draftRef.current = nextValue;
  };

  return (
    <textarea
      lang="ko"
      className={`${UNCONTROLLED_TEXTAREA_CLASS} ${className}`}
      defaultValue={defaultValue}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onInput={(event) => {
        if (!composingRef.current) syncDraft(event.currentTarget.value);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        syncDraft(event.currentTarget.value);
      }}
    />
  );
});

export function extractCategorySuggestionLabels(options: OptionLike[] = []) {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const item of options) {
    const label =
      typeof item === "string"
        ? item.trim()
        : String(item.label ?? item.name ?? item.value ?? "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    rows.push(label);
  }
  return rows;
}

/** Static datalist rendered once — immune to sibling input re-renders. */
export const CategoryDatalistOptions = React.memo(function CategoryDatalistOptions({
  listId,
  suggestions,
}: {
  listId: string;
  suggestions: readonly string[];
}) {
  if (!suggestions.length) return null;
  return (
    <datalist id={listId}>
      {suggestions.map((label) => (
        <option key={label} value={label} />
      ))}
    </datalist>
  );
});

/** Category field with native datalist — uncontrolled, no parent state on keystroke. */
export const UncontrolledCategoryInput = React.memo(function UncontrolledCategoryInput({
  defaultValue = "",
  draftRef,
  inputRef,
  listId,
  suggestions,
  className = "rounded-xl",
  placeholder = "",
}: {
  defaultValue?: string;
  draftRef: React.MutableRefObject<string>;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  listId: string;
  suggestions: readonly string[];
  className?: string;
  placeholder?: string;
}) {
  const composingRef = useRef(false);

  useEffect(() => {
    draftRef.current = defaultValue;
  }, [defaultValue, draftRef]);

  const syncDraft = (nextValue: string) => {
    draftRef.current = nextValue;
  };

  return (
    <>
      <input
        ref={inputRef}
        lang="ko"
        list={suggestions.length ? listId : undefined}
        className={`${UNCONTROLLED_INPUT_CLASS} ${className}`}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onInput={(event) => {
          if (!composingRef.current) syncDraft(event.currentTarget.value);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          syncDraft(event.currentTarget.value);
        }}
      />
      <CategoryDatalistOptions listId={listId} suggestions={suggestions} />
    </>
  );
});

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
  /** freeSolo일 때 입력 중에는 onChange를 호출하지 않고, 선택·blur·바깥 클릭 시 반영 */
  commitFreeSoloOnBlur?: boolean;
  /** 포커스 blur만으로는 드롭다운을 닫지 않음 (항목 클릭·바깥 클릭·Esc) */
  keepOpenUntilSelect?: boolean;
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
  commitFreeSoloOnBlur = false,
  keepOpenUntilSelect = false,
  compact = true,
}: AutocompleteInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const openOnFocus = showOptionsOnFocus ?? !(inputProps as { excelGrid?: boolean }).excelGrid;

  const passthroughInputProps = Object.fromEntries(
    Object.entries(inputProps).filter(
      ([key]) =>
        ![
          "onKeyDown",
          "excelGrid",
          "showOptionsOnFocus",
          "commitFreeSoloOnBlur",
          "keepOpenUntilSelect",
          "onLiveValueChange",
          "className",
        ].includes(key),
    ),
  );
  const resolvedInputClassName = resolveAutocompleteInputClassName(inputProps, compact !== false);
  const useCompactMenu = compact !== false;

  const normalizedOptions = useMemo(() => mapAutocompleteOptions(options), [options]);

  const selectedOption = normalizedOptions.find((item) => item.value === value);
  const resolvedLabel = selectedOption?.label ?? String(value ?? "");

  useEffect(() => {
    if (!focused) setInputText(resolvedLabel);
  }, [resolvedLabel, focused]);

  const commitInputText = (nextText: string) => {
    setInputText(nextText);
    if (freeSolo && !commitFreeSoloOnBlur) onChange(nextText);
    setHighlightedIndex(0);
  };

  const commitFreeSoloValue = (nextText: string) => {
    const trimmed = nextText.trim();
    setInputText(trimmed);
    onChange(trimmed);
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

  const displayOptions = useMemo(() => {
    if (filtered.length > 0) return filtered;
    const trimmed = inputText.trim();
    if (!freeSolo || !trimmed) return filtered;
    const hasExactMatch = normalizedOptions.some(
      (item) => item.label.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (hasExactMatch) return filtered;
    return [{ label: `"${trimmed}" 사용`, value: trimmed, raw: null }];
  }, [filtered, freeSolo, inputText, normalizedOptions]);

  const selectItem = (item: { label: string; value: string; raw: unknown }) => {
    const nextLabel = item.raw == null && freeSolo ? item.value : item.label;
    setInputText(nextLabel);
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

  const canShowDropdown =
    focused && displayOptions.length > 0 && (inputText.trim().length > 0 || openOnFocus);
  const canPickFromDropdown = canShowDropdown && (inputText.trim().length > 0 || openOnFocus);

  const closeDropdown = useCallback(
    (commitValue = false) => {
      if (commitValue && freeSolo && commitFreeSoloOnBlur) {
        const trimmed = inputText.trim();
        setInputText(trimmed);
        onChange(trimmed);
      }
      setFocused(false);
    },
    [commitFreeSoloOnBlur, freeSolo, inputText, onChange],
  );

  const updateMenuPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const width = rect.width;
    const maxHeight = useCompactMenu ? 144 : 256;
    let top = rect.bottom + (useCompactMenu ? 2 : 4);
    let left = Math.max(8, rect.left);
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + maxHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - maxHeight - 4);
    }
    setMenuStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight,
      zIndex: 10000,
    });
  }, [useCompactMenu]);

  useEffect(() => {
    if (!canShowDropdown) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [canShowDropdown, updateMenuPosition, displayOptions.length, inputText, highlightedIndex]);

  useEffect(() => {
    if (!canShowDropdown) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeDropdown(true);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [canShowDropdown, closeDropdown]);

  const dropdownMenu = canShowDropdown ? (
    <div
      ref={menuRef}
      style={menuStyle}
      className={`erp-autocomplete-menu erp-autocomplete-menu--portal overflow-y-auto border bg-white ${
        useCompactMenu ? "erp-autocomplete-menu--compact" : "rounded-2xl shadow-xl"
      }`}
      onMouseDown={(event) => event.preventDefault()}
    >
      {displayOptions.map((item, index) => (
        <button
          key={`${item.value}-${index}`}
          type="button"
          className={`erp-autocomplete-option w-full border-b text-left hover:bg-slate-50 ${
            useCompactMenu ? "erp-autocomplete-option--inline" : ""
          } ${highlightedIndex === index ? "bg-slate-50" : ""} ${item.raw == null && freeSolo ? "erp-autocomplete-option--create" : ""}`}
          onMouseEnter={() => setHighlightedIndex(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectItem(item);
          }}
        >
          <div className="erp-autocomplete-option-label">{item.label}</div>
          {renderSub && item.raw != null ? <div className="erp-autocomplete-option-sub">{renderSub(item.raw)}</div> : null}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative">
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
          if (keepOpenUntilSelect) return;
          setTimeout(() => {
            if (keepOpenUntilSelect) return;
            if (freeSolo && commitFreeSoloOnBlur) {
              commitFreeSoloValue(inputText);
            }
            setFocused(false);
            if (!freeSolo) {
              if (!inputText.trim()) commitClearedSelection();
              else setInputText(resolvedLabel);
            }
          }, 150);
        }}
        onKeyDown={(e) => {
          if (isImeActive(e)) return;

          if (e.key === "Escape" && canShowDropdown) {
            e.preventDefault();
            closeDropdown(commitFreeSoloOnBlur);
            return;
          }

          const dropdownUsesVerticalKeys = canPickFromDropdown;

          if (dropdownUsesVerticalKeys && e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % displayOptions.length);
            return;
          }

          if (dropdownUsesVerticalKeys && e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + displayOptions.length) % displayOptions.length);
            return;
          }

          if (e.key === "Enter") {
            if (canPickFromDropdown) {
              e.preventDefault();
              selectItem(displayOptions[highlightedIndex] || displayOptions[0]);
              return;
            }
            if (freeSolo && commitFreeSoloOnBlur && inputText.trim()) {
              e.preventDefault();
              commitFreeSoloValue(inputText);
              setFocused(false);
              return;
            }
            if (!freeSolo && !inputText.trim()) {
              e.preventDefault();
              commitClearedSelection();
              return;
            }
          }

          if (canPickFromDropdown && e.key === "Tab") {
            selectItem(displayOptions[highlightedIndex] || displayOptions[0]);
            return;
          }

          (inputProps.onKeyDown as ((event: React.KeyboardEvent<HTMLInputElement>) => void) | undefined)?.(e);
        }}
        {...passthroughInputProps}
      />

      {dropdownMenu ? createPortal(dropdownMenu, document.body) : null}
    </div>
  );
}

type CategorySuggestInputProps = {
  value?: string;
  onChange: (value: string) => void;
  options?: OptionLike[];
  placeholder?: string;
  className?: string;
  listId?: string;
};

/** Lightweight category text field with native datalist suggestions (no portal dropdown). */
export function CategorySuggestInput({
  value = "",
  onChange,
  options = [],
  placeholder = "",
  className = "rounded-xl",
  listId: listIdProp,
}: CategorySuggestInputProps) {
  const autoId = React.useId();
  const listId = listIdProp || `category-suggest-${autoId.replace(/:/g, "")}`;
  const suggestions = useMemo(() => extractCategorySuggestionLabels(options), [options]);

  return (
    <>
      <input
        lang="ko"
        list={suggestions.length ? listId : undefined}
        className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      ) : null}
    </>
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
