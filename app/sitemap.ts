import type { MetadataRoute } from "next";
import { CHAPTER_SLUGS } from "@/lib/report-parser";

const BASE_URL = "https://rcitabunghaji.my";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...CHAPTER_SLUGS.map((bab) => ({
      url: `${BASE_URL}/laporan/${bab}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
