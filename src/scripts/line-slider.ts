export function initLineSlider(slider: HTMLElement) {
  const list = slider.querySelector<HTMLElement>(".slider_list")!;
  const slides = [...list.children] as HTMLElement[];
  const markers = slider.querySelector<HTMLElement>(".slider_markers")!;
  const steps = [...slider.querySelectorAll<HTMLButtonElement>("[data-step]")];
  const loop = slider.dataset.loop === "true";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  const options = { signal: events.signal };
  const originals = new Map<HTMLElement, string>();
  slides.forEach(slide => slide.querySelectorAll<HTMLElement>("[data-split-lines]").forEach(text => originals.set(text, text.textContent!.trim().replace(/\s+/g, " "))));
  let current = 0;
  let requested = 0;
  let busy = false;
  let alive = true;
  let revision = 0;
  let animations: Animation[] = [];
  const status = document.createElement("span");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  slider.append(status);

  const show = () => {
    slides.forEach((slide, index) => {
      slide.dataset.active = String(index === current);
      slide.inert = index !== current;
      slide.setAttribute("aria-hidden", String(index !== current));
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-label", `${index + 1} of ${slides.length}`);
    });
    [...markers.children].forEach((marker, index) => {
      marker.classList.toggle("is-active", index === current);
      if (index === current) marker.setAttribute("aria-current", "true");
      else marker.removeAttribute("aria-current");
    });
    steps.forEach(step => { step.disabled = slides.length < 2 || (!loop && (Number(step.dataset.step) < 0 ? current === 0 : current === slides.length - 1)); });
  };
  const split = () => {
    for (const [element, original] of originals) {
      element.textContent = original;
      const text = element.firstChild!;
      const range = document.createRange();
      const lines: string[] = [];
      let previousTop = -Infinity;
      for (const word of original.matchAll(/\S+/g)) {
        range.setStart(text, word.index!);
        range.setEnd(text, word.index! + word[0].length);
        const top = range.getBoundingClientRect().top;
        if (Math.abs(top - previousTop) > 2) { lines.push(word[0]); previousTop = top; }
        else lines[lines.length - 1] += ` ${word[0]}`;
      }
      const accessible = document.createElement("span");
      accessible.className = "sr-only";
      accessible.textContent = original;
      element.replaceChildren(accessible, ...lines.map(line => {
        const mask = document.createElement("span");
        mask.className = "slider_line";
        mask.setAttribute("aria-hidden", "true");
        const content = document.createElement("span");
        content.className = "slider_line-text";
        content.textContent = line;
        mask.append(content);
        return mask;
      }));
    }
  };
  const play = async (slide: HTMLElement, entering: boolean) => {
    const lines = [...slide.querySelectorAll<HTMLElement>(".slider_line-text")];
    const batch = lines.map((line, index) => line.animate(
      entering ? [{ transform: "translateY(110%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 0 }],
      { duration: entering ? 460 : 240, delay: entering ? index * 45 : 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
    ));
    slide.querySelectorAll<HTMLElement>("[data-line-meta]").forEach(element => batch.push(element.animate(
      entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: entering ? 300 : 180, fill: "both" },
    )));
    slide.querySelectorAll<HTMLElement>("[data-line-star]").forEach((star, index) => batch.push(star.animate(
      entering ? [{ opacity: 0, transform: "translateY(0.45em) scale(0.7) rotate(-15deg)" }, { opacity: 1, transform: "translateY(0) scale(1) rotate(0deg)" }]
        : [{ opacity: 1 }, { opacity: 0 }],
      { duration: entering ? 380 : 180, delay: entering ? index * 65 : 0, easing: entering ? "cubic-bezier(0.22, 1.3, 0.36, 1)" : "ease-out", fill: "both" },
    )));
    animations.push(...batch);
    await Promise.all(batch.map(animation => animation.finished.catch(() => {})));
  };
  const go = async (index: number) => {
    requested = loop ? ((index % slides.length) + slides.length) % slides.length : Math.max(0, Math.min(slides.length - 1, index));
    if (busy || requested === current) return;
    busy = true;
    const token = ++revision;
    if (!reduced.matches) await play(slides[current], false);
    if (!alive || token !== revision) return;
    current = requested;
    show();
    if (!reduced.matches) await play(slides[current], true);
    if (!alive || token !== revision) return;
    animations.forEach(animation => animation.cancel());
    animations = [];
    status.textContent = `Review ${current + 1} of ${slides.length}`;
    busy = false;
    if (requested !== current) void go(requested);
  };
  markers.replaceChildren(...slides.map((_, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "slider_marker";
    marker.setAttribute("aria-label", `Go to slide ${index + 1}`);
    marker.addEventListener("click", () => void go(index), options);
    return marker;
  }));
  steps.forEach(step => step.addEventListener("click", () => void go(requested + Number(step.dataset.step)), options));
  list.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    void go(requested + (event.key === "ArrowRight" ? 1 : -1));
  }, options);
  let touch: { id: number; x: number; y: number } | undefined;
  list.addEventListener("pointerdown", event => {
    if (event.isPrimary && event.button === 0) touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, options);
  list.addEventListener("pointerup", event => {
    if (touch?.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    touch = undefined;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) void go(requested + (dx < 0 ? 1 : -1));
  }, options);
  list.addEventListener("pointercancel", () => { touch = undefined; }, options);
  const refresh = () => {
    revision++;
    animations.forEach(animation => animation.cancel());
    animations = [];
    busy = false;
    current = requested;
    split();
    show();
  };
  let width = list.clientWidth;
  const resize = new ResizeObserver(() => {
    if (list.clientWidth !== width) { width = list.clientWidth; refresh(); }
  });
  resize.observe(list);
  reduced.addEventListener("change", refresh, options);
  slider.classList.add("is-ready");
  slider.querySelector(".slider_controls")?.classList.toggle("is-empty", slides.length < 2);
  refresh();
  void document.fonts.ready.then(() => { if (alive) refresh(); });
  document.addEventListener("astro:before-swap", () => {
    alive = false;
    revision++;
    events.abort();
    resize.disconnect();
    animations.forEach(animation => animation.cancel());
  }, { once: true });
}
