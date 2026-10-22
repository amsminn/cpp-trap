import type { ReactElement, ReactNode } from "react";

/** A visible glyph hidden from assistive technology. Its meaning must stay in the text beside it; not an icon system. */
export function Decorative({ children }: { children: ReactNode }): ReactElement {
  return <span aria-hidden="true">{children}</span>;
}
