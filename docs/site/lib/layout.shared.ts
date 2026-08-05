import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/** Nav shared by the landing page and the docs section so the header does not shift. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: "nom" },
    githubUrl: "https://github.com/Jedddy/nom",
    links: [{ text: "Documentation", url: "/docs" }],
    // Search needs a server route the static export cannot emit.
    searchToggle: { enabled: false },
  };
}
