"use client";

import type { Tag } from "@/lib/data/tags";

export function TagPicker({
  allTags,
  selected,
  onChange,
}: {
  allTags: Tag[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name]);
  }

  if (allTags.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        尚未建立任何 Tag，請先到「Tag 管理」新增。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allTags.map((tag) => (
        <label
          key={tag.id}
          className={`cursor-pointer rounded-full px-3 py-1 text-xs transition ${
            selected.includes(tag.name)
              ? "bg-purple-500 text-white"
              : "bg-purple-50 text-purple-600"
          }`}
        >
          <input
            type="checkbox"
            className="hidden"
            checked={selected.includes(tag.name)}
            onChange={() => toggle(tag.name)}
          />
          #{tag.name}
        </label>
      ))}
    </div>
  );
}
