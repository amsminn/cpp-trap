import type { ComponentPropsWithoutRef, ReactElement } from "react";

/**
 * The single main landmark of every route (V002). It carries the shared `.main` layout class, the `#main` id the
 * header's "Skip to content" link targets, and `tabindex="-1"` so that link (and later route focus policies) can
 * move focus into the content without adding a Tab stop. Pass only modifiers in `className` ("single", "about").
 */
export function PageMain({ className, ...props }: ComponentPropsWithoutRef<"main">): ReactElement {
  return <main id="main" tabIndex={-1} className={className ? `main ${className}` : "main"} {...props} />;
}
