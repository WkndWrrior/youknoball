import {
  serializeStructuredData,
  websiteStructuredData,
} from "@/lib/seo";

export function WebsiteStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeStructuredData(websiteStructuredData),
      }}
    />
  );
}
