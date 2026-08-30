import { siteName, visualWordmark } from "@/lib/seo";

type BrandWordmarkProps = {
  className?: string;
};

export function BrandWordmark({ className = "" }: BrandWordmarkProps) {
  return (
    <span
      aria-label={siteName}
      className={`block font-display text-xl font-semibold uppercase tracking-[0.08em] text-[#ff7a18] ${className}`.trim()}
    >
      {visualWordmark}
    </span>
  );
}
