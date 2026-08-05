import type { ReactNode } from "react";

type DemoSlotProps = {
  /**
   * Media source for the recorded demo. When absent the slot renders `fallback`, so the
   * page is complete before the recording exists and gains the media later without any
   * change to the surrounding layout.
   */
  readonly src?: string;
  readonly poster?: string;
  /** Shown in place of the media until a recording exists. */
  readonly fallback: ReactNode;
  /** Text equivalent, for readers who cannot perceive the media. */
  readonly transcript: ReactNode;
};

export function DemoSlot({ src, poster, fallback, transcript }: DemoSlotProps) {
  return (
    <figure className="m-0 flex flex-col gap-3">
      {src ? (
        <video
          className="w-full rounded-xl border border-fd-border bg-fd-muted shadow-sm"
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Recording: an agent request updating component props"
        />
      ) : (
        fallback
      )}
      <figcaption className="text-sm leading-relaxed text-fd-muted-foreground">
        {transcript}
      </figcaption>
    </figure>
  );
}
