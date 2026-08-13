import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/** Nav shared by the landing page and the docs section so the header does not shift.
 *
 *  `docsLink` is off inside the docs section itself: DocsLayout repeats these links at
 *  the top of the sidebar, where a "Documentation" entry sits directly above the
 *  identically named index page. */
export function baseOptions({ docsLink = true } = {}): BaseLayoutProps {
  return {
    nav: { title: "nom" },
    githubUrl: "https://github.com/Jedddy/nom",
    links: docsLink ? [{ text: "Documentation", url: "/docs" }] : [],
    // Search needs a server route the static export cannot emit.
    searchToggle: { enabled: false },
  };
}
