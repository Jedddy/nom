/**
 * The shared body of every Open Graph card, rendered by `next/og` into a PNG at build
 * time — never sent to a browser.
 *
 * Satori (what `next/og` renders with) supports a subset of CSS and no Tailwind class
 * resolution outside its own inline `tw` prop, so these are plain inline styles on
 * purpose. It also has no automatic `display: block`: every element needs `flex`.
 */
export function OgCard({
  title,
  description,
  eyebrow,
}: {
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#0a0a0a",
        // A single soft highlight keeps the card from reading as a flat black rectangle
        // in a timeline without pulling attention off the title.
        backgroundImage:
          "radial-gradient(circle at 20% 0%, #1f1f2e 0%, #0a0a0a 55%)",
        padding: "80px",
        color: "#fafafa",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8b8b98",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            lineHeight: 1.4,
            color: "#a1a1aa",
            // Satori has no ellipsis truncation, so long descriptions are clamped by the
            // callers that build them rather than by CSS here.
            maxWidth: "900px",
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          fontSize: 28,
          color: "#8b8b98",
        }}
      >
        <div style={{ display: "flex", color: "#fafafa", fontWeight: 600 }}>nom</div>
        <div style={{ display: "flex" }}>nom.jpndev.xyz</div>
      </div>
    </div>
  );
}

/** The size every major platform crops from; anything else gets letterboxed. */
export const ogSize = { width: 1200, height: 630 };
export const ogAlt = "nom — connect AI tool calls to React component props";
