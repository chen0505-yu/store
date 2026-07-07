// 共用進度條元件：前台與後台都用同一個，風格統一（粉色進度線、紫色完成勾選）。
// 只負責畫圖，不含任何業務邏輯——目前在哪一步（currentIndex）由呼叫端依各自的資料狀態算好再傳進來，
// 純函式邏輯見 src/lib/progress.ts，方便同步規則有變動時只改一個地方。
export function ProgressStepper({
  steps,
  currentIndex,
  size = "md",
}: {
  steps: string[];
  currentIndex: number;
  size?: "sm" | "md";
}) {
  const circleSize = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";
  const labelSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="flex w-full items-start">
      {steps.map((label, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={label} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${circleSize} ${
                  isCompleted
                    ? "bg-purple-500 text-white"
                    : isCurrent
                      ? "border-2 border-purple-500 bg-white text-purple-600"
                      : "border border-pink-200 bg-pink-50 text-pink-300"
                }`}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <span
                className={`${labelSize} w-16 text-center leading-tight ${
                  isCompleted || isCurrent ? "font-semibold text-purple-700" : "text-zinc-400"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mt-2.5 sm:mt-3.5 h-0.5 flex-1 ${isCompleted ? "bg-purple-400" : "bg-pink-100"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
