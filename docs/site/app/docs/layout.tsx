import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";

export default function DocsRouteLayout({ children }: { readonly children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions()} tree={source.pageTree}>
      {children}
    </DocsLayout>
  );
}
