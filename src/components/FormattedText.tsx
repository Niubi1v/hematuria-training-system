import clsx from "clsx";

type Props = {
  text: string;
  highlight?: string[];
  className?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderInline(text: string, highlight: string[]) {
  const words = highlight.map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 16);
  if (!words.length) return text;
  const regex = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  return text.split(regex).map((part, index) => {
    const hit = words.some((word) => part.toLowerCase() === word.toLowerCase());
    return hit ? (
      <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-1 text-amber-900">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
}

export default function FormattedText({ text, highlight = [], className }: Props) {
  if (!text?.trim()) return <p className={clsx("text-sm text-clinic-muted", className)}>暂无记录。</p>;
  const blocks = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);

  return (
    <div className={clsx("space-y-2 text-sm leading-7 text-clinic-ink", className)}>
      {blocks.map((block, index) => {
        if (/^[-*]\s+/.test(block)) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clinic-blue" />
              <span>{renderInline(block.replace(/^[-*]\s+/, ""), highlight)}</span>
            </div>
          );
        }
        if (/^#{1,3}\s+/.test(block)) {
          return <h3 key={index} className="font-semibold">{renderInline(block.replace(/^#{1,3}\s+/, ""), highlight)}</h3>;
        }
        return <p key={index}>{renderInline(block, highlight)}</p>;
      })}
    </div>
  );
}
