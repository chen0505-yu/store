"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full bg-purple-500 px-4 py-2 text-sm font-medium text-white"
    >
      列印出貨單
    </button>
  );
}
