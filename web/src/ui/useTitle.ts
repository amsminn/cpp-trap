import { pageTitle } from "@cpp-trap/shared";
import { useLayoutEffect } from "react";

export function useTitle(page: string, full = false): void {
  useLayoutEffect(() => {
    document.title = full ? page : pageTitle(page);
  }, [page, full]);
}
