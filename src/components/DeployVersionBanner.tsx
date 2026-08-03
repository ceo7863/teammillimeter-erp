import React from "react";

export function DeployVersionBanner({
  visible,
  onApply,
}: {
  visible: boolean;
  onApply: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[120] border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 shadow">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {"\uC0C8 \uBC84\uC804\uC774 \uBC30\uD3EC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAE08\uC735 \uC800\uC7A5 \uC804\uC5D0 \uC0C8 \uBC84\uC804\uC744 \uC801\uC6A9\uD574 \uC8FC\uC138\uC694."}
        </span>
        <button
          type="button"
          className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800"
          onClick={onApply}
        >
          {"\uC0C8 \uBC84\uC804 \uC801\uC6A9"}
        </button>
      </div>
    </div>
  );
}
