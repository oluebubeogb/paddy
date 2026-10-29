import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (Next metadata route) and linked automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Paddy — Your personal AI companion",
    short_name: "Paddy",
    description: "Someone who remembers what matters to you.",
    start_url: "/chat?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#faf8f5",
    theme_color: "#0d9488",
    categories: ["lifestyle", "social", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/paddy-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Chat with Paddy", short_name: "Chat", url: "/chat", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Memories", url: "/memories" },
      { name: "Life", url: "/life" },
    ],
  };
}
