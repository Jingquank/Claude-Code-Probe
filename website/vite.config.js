import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "site-metadata",
      transformIndexHtml(html) {
        const configured =
          process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
        if (!configured) return html.replace("<!-- social-url -->", "");
        const origin = new URL(
          configured.includes("://") ? configured : `https://${configured}`,
        ).origin;
        return html.replace(
          "<!-- social-url -->",
          `<link rel="canonical" href="${origin}/"><meta property="og:url" content="${origin}/"><meta property="og:image" content="${origin}/assets/social.jpg"><meta property="og:image:width" content="1400"><meta property="og:image:height" content="560">`,
        );
      },
    },
  ],
  server: { fs: { strict: true, allow: ["."] } },
});
