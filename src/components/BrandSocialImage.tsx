import {
  brandBackground,
  brandOrange,
  visualWordmark,
} from "@/lib/seo";

export function BrandSocialImage() {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: brandBackground,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "42px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          border: `2px solid ${brandOrange}`,
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
            fontSize: "122px",
            fontWeight: 900,
            letterSpacing: "6px",
            lineHeight: 1,
          }}
        >
          {visualWordmark}
        </div>
      </div>
    </div>
  );
}
