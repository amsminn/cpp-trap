import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";

function MountedApp() {
  useLayoutEffect(() => {
    document.getElementById("startup-fallback")?.remove();
  }, []);
  return <App />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
// React owns only this host. A failed first render cannot erase the static recovery surface.
const host = document.createElement("div");
root.append(host);
createRoot(host).render(
  <StrictMode>
    <BrowserRouter>
      <MountedApp />
    </BrowserRouter>
  </StrictMode>,
);
