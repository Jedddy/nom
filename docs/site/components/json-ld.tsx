/**
 * Renders a schema.org graph as JSON-LD.
 *
 * Structured data is the one part of the page written for machines only, and it is what
 * search engines and LLM crawlers read to decide what this site *is* rather than what
 * words it contains.
 *
 * `<` is escaped because an unescaped `</script>` inside the JSON — reachable through any
 * page description — would close this tag early and spill the rest into the document.
 */
export function JsonLd({ schema }: { readonly schema: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
