// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./src/consts.ts";
import { isNoindexRoute } from "./src/utils/seo.ts";

export default defineConfig({
  site: SITE_URL,
  redirects: { "/plans": "/#plans" },
  integrations: [
    sitemap({
      filter: (page) => !isNoindexRoute(new URL(page).pathname),
    }),
  ],
  fonts: [
    {
      name: "Archivo",
      cssVariable: "--font-archivo",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: ["./src/assets/fonts/archivo-400.ttf"],
          },
          {
            weight: 500,
            style: "normal",
            src: ["./src/assets/fonts/archivo-500.ttf"],
          },
          {
            weight: 600,
            style: "normal",
            src: ["./src/assets/fonts/archivo-600.ttf"],
          },
          {
            weight: 700,
            style: "normal",
            src: ["./src/assets/fonts/archivo-700.ttf"],
          },
        ],
      },
    },
    {
      name: "Oswald",
      cssVariable: "--font-oswald",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: 500,
            style: "normal",
            src: ["./src/assets/fonts/oswald-500.ttf"],
          },
          {
            weight: 600,
            style: "normal",
            src: ["./src/assets/fonts/oswald-600.ttf"],
          },
        ],
      },
    },
  ],
  vite: { build: { cssTarget: "safari15.4" } },
});
