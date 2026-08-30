import {
  brandBackground,
  brandOrange,
  compactMark,
} from "@/lib/seo";

type BrandAppIconProps = {
  size?: number;
};

export function BrandAppIcon({ size = 512 }: BrandAppIconProps = {}) {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: brandBackground,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          color: brandOrange,
          display: "flex",
          fontSize: Math.round(size * 0.31),
          fontWeight: 900,
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        {compactMark}
      </div>
    </div>
  );
}
