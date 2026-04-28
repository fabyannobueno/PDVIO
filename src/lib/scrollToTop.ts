export function scrollAppToTop() {
  const doScroll = () => {
    const el = document.getElementById("app-scroll");
    if (el) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
      document.body.scrollTo?.({ top: 0, behavior: "smooth" });
    }
  };
  doScroll();
  requestAnimationFrame(doScroll);
  setTimeout(doScroll, 50);
}
