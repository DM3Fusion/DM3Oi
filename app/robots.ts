import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/auth/",
        "/account/",
        "/admin/",
        "/portal/",
        "/cases/",
        "/communications/",
        "/service-desk/",
        "/customers/",
        "/tasks/",
        "/questions/",
        "/reports/",
        "/users/",
        "/settings/",
        "/administration/",
      ],
    },
  };
}
