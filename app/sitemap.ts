import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://dm3oi.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
      images: [
        `${siteUrl}/brand/DM3Oi_landing_page_top_left.webp`,
        `${siteUrl}/brand/DM3Oi_Land_Page_TopLeft2.webp`,
      ],
    },
  ];
}
