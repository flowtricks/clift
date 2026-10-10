import Lenis from "lenis";

let lenis: Lenis | undefined;

function initSmoothScroll() {
  if (lenis) return;
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.12,
    anchors: true,
    autoToggle: true,
    allowNestedScroll: true,
    stopInertiaOnNavigate: true,
    respectReducedMotion: true,
  });
}

function destroySmoothScroll() {
  lenis?.destroy();
  lenis = undefined;
}

initSmoothScroll();
document.addEventListener("astro:page-load", initSmoothScroll);
document.addEventListener("astro:before-swap", destroySmoothScroll);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    destroySmoothScroll();
    document.removeEventListener("astro:page-load", initSmoothScroll);
    document.removeEventListener("astro:before-swap", destroySmoothScroll);
  });
}
