export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-purple-50/60 py-16 text-center text-zinc-500">
      <span className="text-4xl">🦝</span>
      <p>{text}</p>
    </div>
  );
}
