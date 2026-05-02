import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

const SPLASH_MIN_MS = import.meta.env.DEV ? 300 : 3000;
const splashShownAt = (window as any).__APP_SPLASH_SHOWN_AT__ ?? performance.now();
requestAnimationFrame(() => {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  const elapsed = performance.now() - splashShownAt;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
  setTimeout(() => {
    splash.classList.add("is-hiding");
    setTimeout(() => splash.remove(), 400);
  }, wait);
});

const isFormField = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

document.addEventListener("contextmenu", (e) => {
  if (isFormField(e.target)) return;
  e.preventDefault();
});

document.addEventListener("dragstart", (e) => {
  if (e.target instanceof HTMLImageElement) e.preventDefault();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
