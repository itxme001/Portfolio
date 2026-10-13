/* ============================================================================
 * XAVIER - CORE RUNTIME v4
 * ---------------------------------------------------------------------------
 * Layers (each one is optional, the site works without it):
 *   1. Vanilla core      - nav, menu, FAQ, forms, slider, work rail, cursor
 *   2. GSAP + ScrollTrigger - hero intro, manifesto scrub, reel scale, process line
 *   3. Lenis             - smooth scrolling
 *   4. Motion (Framer Motion's vanilla engine) - spring physics on magnetic buttons
 *
 * Every module no-ops when its markup is missing, so this single file is safe
 * to load on every page (index + Pages/*.html).
 * ==========================================================================*/

(() => {
  "use strict";

  /* ==========================================================================
   * 0 · BOOTSTRAP
   * ========================================================================*/
  const ROOT = document.documentElement;
  ROOT.classList.remove("no-js");
  ROOT.classList.add("js");

  const CONFIG = Object.freeze({
    navScrollThreshold: 80,
    navHideAfter: 400,
    navOffset: 80,
    countUpDuration: 2000,
    testimonialAutoplay: 6000,
    testimonialSwipeMin: 50,
    magneticStrength: 0.28,
    heroClipInterval: 3400,
  });

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  const FINE = window.matchMedia("(hover: hover) and (pointer: fine)");
  const motionOK = () => !REDUCED.matches;
  const pointerOK = () => FINE.matches && motionOK();

  /* --- Optional libraries -------------------------------------------------- */
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const HAS_GSAP = typeof G === "object" || typeof G === "function";
  const HAS_ST = HAS_GSAP && !!ST;
  const HAS_LENIS = typeof window.Lenis === "function";
  const MOTION = window.Motion || null;
  if (HAS_ST) G.registerPlugin(ST);

  /* --- Utilities ------------------------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const lerp = (a, b, t) => a + (b - a) * t;
  const on = (target, type, handler, opts) =>
    target && target.addEventListener(type, handler, opts);
  const ready = (fn) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : fn();
  const safe = (fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`[xavier] ${fn.name || "module"} failed:`, err);
    }
  };
  const makeStore = (area) => ({
    get(key) {
      try {
        return window[area].getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window[area].setItem(key, value);
      } catch {
        /* storage unavailable */
      }
    },
  });
  const store = makeStore("localStorage");
  const session = makeStore("sessionStorage");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let lenis = null;

  /** Pause or resume page scroll (menu open, preloader running). */
  const lockScroll = (locked) => {
    document.body.classList.toggle("no-scroll", locked);
    if (lenis) locked ? lenis.stop() : lenis.start();
  };

  /** Decide which animation layers are allowed on this page. */
  function resolveAnimMode() {
    if (!motionOK()) {
      ROOT.classList.remove("anim", "rv");
      clearTimeout(window.__animGuard);
      return;
    }
    ROOT.classList.add("rv"); // scroll-reveal only needs IntersectionObserver
    if (!HAS_GSAP) {
      // Hero intro needs GSAP. Without it, show everything immediately.
      ROOT.classList.remove("anim");
      clearTimeout(window.__animGuard);
    }
  }

  /* ==========================================================================
   * 1 · SMOOTH SCROLL (Lenis)
   * ========================================================================*/
  function initSmoothScroll() {
    if (!HAS_LENIS || !motionOK()) return;

    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    ROOT.classList.add("lenis", "lenis-smooth");

    if (HAS_ST) {
      lenis.on("scroll", ST.update);
      G.ticker.add((time) => lenis.raf(time * 1000));
      G.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }

    // The body starts locked for the preloader.
    if (document.body.classList.contains("no-scroll")) lenis.stop();
  }

  /* ==========================================================================
   * 2 · PRELOADER + PAGE INTRO
   * ========================================================================*/
  let introStarted = false;

  function startIntro() {
    if (introStarted) return;
    introStarted = true;

    safe(initCountUp);
    safe(initScrollReveal);
    safe(heroIntro);
    safe(initScrollAnimations);
  }

  function initPreloader() {
    const pre = $("#preloader");

    if (!pre) {
      lockScroll(false);
      startIntro();
      return;
    }

    const returning = session.get("xv-intro") === "1";
    if (returning || !motionOK()) {
      pre.remove();
      lockScroll(false);
      startIntro();
      return;
    }
    session.set("xv-intro", "1");

    const bar = $("#preloader-bar");
    const counter = $("#preloader-count");
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      pre.remove();
      lockScroll(false);
      startIntro();
    };
    setTimeout(finish, 4500); // safety net: never trap the visitor

    const paint = (p) => {
      if (bar) bar.style.transform = `scaleX(${p})`;
      if (counter) counter.textContent = `${Math.round(p * 100)}%`;
    };

    if (!HAS_GSAP) {
      const t0 = performance.now();
      const tick = (now) => {
        const p = clamp((now - t0) / 700, 0, 1);
        paint(p);
        if (p < 1) return requestAnimationFrame(tick);
        pre.style.transition = "opacity .4s";
        pre.style.opacity = "0";
        setTimeout(finish, 420);
      };
      requestAnimationFrame(tick);
      return;
    }

    const state = { p: 0 };
    const items = [
      $(".preloader-logo", pre),
      $(".preloader-tagline", pre),
    ].filter(Boolean);

    G.timeline({ onComplete: finish })
      .fromTo(
        items,
        { y: 28, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: "expo.out", stagger: 0.1 },
      )
      .to(
        state,
        {
          p: 1,
          duration: 1,
          ease: "power2.inOut",
          onUpdate: () => paint(state.p),
        },
        0.1,
      )
      .to(pre, { yPercent: -100, duration: 0.95, ease: "expo.inOut" }, ">+0.1");
  }

  /** One orchestrated hero moment: status, title lines, viewfinder, CTA. */
  function heroIntro() {
    const hero = $("#hero");
    if (!hero || !HAS_GSAP || !motionOK()) {
      if (!HAS_GSAP || !motionOK()) ROOT.classList.remove("anim");
      clearTimeout(window.__animGuard);
      return;
    }

    G.timeline({
      defaults: { ease: "expo.out" },
      onComplete: () => clearTimeout(window.__animGuard),
    })
      .fromTo(
        ".hero-status",
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.9 },
      )
      .fromTo(
        ".hero-title .line-inner",
        { yPercent: 115, opacity: 1 },
        { yPercent: 0, opacity: 1, duration: 1.3, stagger: 0.12 },
        "<0.1",
      )
      .fromTo(
        ".hero-frame",
        { opacity: 1, clipPath: "inset(100% 0% 0% 0%)" },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          duration: 1.4,
          ease: "expo.inOut",
          clearProps: "clipPath",
        },
        "<0.15",
      )
      .fromTo(
        ".hero-bottom",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 1 },
        "<0.5",
      )
      .fromTo(
        ".hero-scroll-indicator",
        { opacity: 0 },
        { opacity: 1, duration: 1 },
        "<0.2",
      );
  }

  /* ==========================================================================
   * 3 · SCROLL-DRIVEN ANIMATION (GSAP + ScrollTrigger)
   * ========================================================================*/
  function splitWords(el) {
    const text = el.textContent.trim().replace(/\s+/g, " ");
    const visual = document.createElement("span");
    visual.setAttribute("aria-hidden", "true");

    text.split(" ").forEach((word, i, all) => {
      const span = document.createElement("span");
      span.className = "w";
      span.textContent = word;
      visual.appendChild(span);
      if (i < all.length - 1) visual.appendChild(document.createTextNode(" "));
    });

    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;

    el.textContent = "";
    el.append(sr, visual);
    el.classList.add("is-split");
    return $$(".w", visual);
  }

  function initScrollAnimations() {
    if (!HAS_ST || !motionOK()) return;

    /* Manifesto: words light up as you read */
    const manifesto = $(".manifesto-text");
    if (manifesto) {
      const words = splitWords(manifesto);
      G.fromTo(
        words,
        { opacity: 0.16 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.1,
          scrollTrigger: {
            trigger: manifesto,
            start: "top 78%",
            end: "bottom 58%",
            scrub: true,
          },
        },
      );
    }

    /* Hero viewfinder drifts up as the page scrolls */
    if ($(".hero-frame") && window.innerWidth > 900) {
      G.to(".hero-frame", {
        yPercent: -10,
        ease: "none",
        scrollTrigger: {
          trigger: "#hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }

    /* Showreel grows into the frame */
    const reel = $("#reel-container");
    if (reel) {
      G.fromTo(
        reel,
        { scale: 0.88, borderRadius: 48 },
        {
          scale: 1,
          borderRadius: 26,
          ease: "none",
          scrollTrigger: {
            trigger: reel,
            start: "top 92%",
            end: "top 35%",
            scrub: true,
          },
        },
      );
    }

    /* Process: the gold line fills as you move through the steps */
    const steps = $(".process-steps");
    if (steps) {
      G.fromTo(
        steps,
        { "--p": 0 },
        {
          "--p": 1,
          ease: "none",
          scrollTrigger: {
            trigger: steps,
            start: "top 65%",
            end: "bottom 65%",
            scrub: 0.4,
          },
        },
      );
    }

    /* Footer wordmark rises into place */
    const wordmark = $(".footer-wordmark");
    if (wordmark) {
      G.fromTo(
        wordmark,
        { yPercent: 28, opacity: 0.35 },
        {
          yPercent: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: "#footer",
            start: "top bottom",
            end: "bottom bottom",
            scrub: true,
          },
        },
      );
    }

    on(window, "load", () => ST.refresh());
  }

  /* ==========================================================================
   * 4 · SCROLL REVEAL + COUNT-UP (IntersectionObserver, no library needed)
   * ========================================================================*/
  function initScrollReveal() {
    const els = $$(".reveal-up, .reveal-left, .reveal-right, .reveal-scale");
    if (!els.length) return;

    if (!motionOK() || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("revealed"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, i) => {
            entry.target.style.setProperty(
              "--rv-delay",
              `${Math.min(i, 6) * 0.08}s`,
            );
            entry.target.classList.add("revealed");
            io.unobserve(entry.target);
          });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => io.observe(el));
  }

  function initCountUp() {
    const els = $$("[data-count], .count-up");
    if (!els.length) return;

    const run = (el) => {
      const target =
        parseFloat(el.dataset.count ?? el.dataset.target ?? "0") || 0;
      const decimals = Number(el.dataset.decimals) || 0;
      const duration = Number(el.dataset.duration) || CONFIG.countUpDuration;
      const paint = (v) => (el.textContent = v.toFixed(decimals));

      if (!motionOK()) return paint(target);

      const t0 = performance.now();
      const step = (now) => {
        const p = clamp((now - t0) / duration, 0, 1);
        paint((1 - Math.pow(1 - p, 4)) * target);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (!("IntersectionObserver" in window))
      return els.forEach(
        (el) => (el.textContent = el.dataset.count ?? el.dataset.target ?? "0"),
      );

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          run(entry.target);
        });
      },
      { threshold: 0.5 },
    );
    els.forEach((el) => io.observe(el));
  }

  /* ==========================================================================
   * 5 · NAVIGATION: scroll state, hide-on-scroll, progress, mobile menu
   * ========================================================================*/
  function initScrollUI() {
    const nav = $("#nav");
    const bar = $("#progress-bar");
    const menu = $("#mobile-menu");
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const max = ROOT.scrollHeight - window.innerHeight;

      if (bar)
        bar.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;

      if (nav) {
        nav.classList.toggle("scrolled", y > CONFIG.navScrollThreshold);
        const delta = y - lastY;
        const menuOpen = menu && menu.classList.contains("open");
        if (!menuOpen) {
          if (y > CONFIG.navHideAfter && delta > 8)
            nav.classList.add("nav--hidden");
          else if (delta < -8 || y <= CONFIG.navHideAfter)
            nav.classList.remove("nav--hidden");
        }
      }
      lastY = y;
      ticking = false;
    };

    on(
      window,
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true },
    );

    // Keyboard users must never lose the nav.
    on(nav, "focusin", () => nav.classList.remove("nav--hidden"));
    update();
  }

  function initMenu() {
    const hamburger = $("#hamburger");
    const menu = $("#mobile-menu");
    if (!hamburger || !menu) return;

    const links = $$(".mobile-menu-link", menu);
    links.forEach((link, i) => link.style.setProperty("--i", i));

    let open = false;
    let lastFocus = null;

    const set = (next) => {
      if (next === open) return;
      open = next;

      menu.classList.toggle("open", open);
      menu.setAttribute("aria-hidden", String(!open));
      if ("inert" in menu) menu.inert = !open;
      hamburger.setAttribute("aria-expanded", String(open));
      hamburger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      lockScroll(open);

      if (open) {
        lastFocus = document.activeElement;
        $("#nav")?.classList.remove("nav--hidden");
        setTimeout(() => links[0]?.focus({ preventScroll: true }), 450);
      } else if (lastFocus && lastFocus.focus) {
        lastFocus.focus({ preventScroll: true });
      }
    };

    // Closed by default: unreachable for keyboard and screen readers.
    menu.setAttribute("aria-hidden", "true");
    if ("inert" in menu) menu.inert = true;

    on(hamburger, "click", () => set(!open));
    links.forEach((link) => on(link, "click", () => set(false)));

    on(document, "keydown", (e) => {
      if (!open) return;
      if (e.key === "Escape") return set(false);
      if (e.key !== "Tab") return;

      const focusables = [hamburger, ...$$("a", menu)];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    on(window, "resize", () => {
      if (open && window.innerWidth > 900) set(false);
    });
  }

  /* ==========================================================================
   * 6 · HERO: live viewfinder + light
   * ========================================================================*/
  function initHeroFrame() {
    const frame = $(".hero-frame");
    if (!frame) return;

    const imgs = $$(".hero-frame-media img", frame);
    const tc = $("#hero-timecode");
    const title = $("#hero-clip");
    if (imgs.length < 2 || !tc || !motionOK()) return;

    const pad = (n) => String(n).padStart(2, "0");
    const t0 = performance.now();
    let index = 0;
    let lastFrame = -1;
    let raf = 0;
    let timer = 0;
    let visible = true;

    const paintTimecode = (now) => {
      const ms = now - t0;
      const frameNo = Math.floor(ms / (1000 / 24));
      if (frameNo !== lastFrame) {
        lastFrame = frameNo;
        const s = Math.floor(ms / 1000);
        tc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frameNo % 24)}`;
      }
      raf = requestAnimationFrame(paintTimecode);
    };

    const nextClip = () => {
      imgs[index].classList.remove("is-active");
      index = (index + 1) % imgs.length;
      imgs[index].classList.add("is-active");
      if (title) title.textContent = imgs[index].dataset.title || "";
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(paintTimecode);
      if (!timer) timer = setInterval(nextClip, CONFIG.heroClipInterval);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      raf = 0;
      timer = 0;
    };
    const sync = () => (visible && !document.hidden ? start() : stop());

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
      }).observe(frame);
    }
    on(document, "visibilitychange", sync);
    sync();
  }

  function initHeroLight() {
    const hero = $("#hero");
    if (!hero || !pointerOK()) return;

    let tx = 72;
    let ty = 28;
    let x = tx;
    let y = ty;
    let raf = 0;

    const loop = () => {
      x = lerp(x, tx, 0.06);
      y = lerp(y, ty, 0.06);
      hero.style.setProperty("--mx", `${x.toFixed(2)}%`);
      hero.style.setProperty("--my", `${y.toFixed(2)}%`);
      raf =
        Math.abs(x - tx) + Math.abs(y - ty) > 0.05
          ? requestAnimationFrame(loop)
          : 0;
    };

    on(hero, "pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }

  /* ==========================================================================
   * 7 · MARQUEE: speeds up with scroll velocity
   * ========================================================================*/
  function initMarquee() {
    const tracks = $$(".ticker-track");
    if (
      !tracks.length ||
      !motionOK() ||
      !("getAnimations" in Element.prototype)
    )
      return;

    let lastY = window.scrollY;
    let velocity = 0;
    let lastRate = 1;

    const tick = () => {
      const y = window.scrollY;
      velocity = lerp(velocity, Math.abs(y - lastY), 0.1);
      lastY = y;

      const rate = 1 + clamp(velocity * 0.35, 0, 6);
      if (Math.abs(rate - lastRate) > 0.03) {
        lastRate = rate;
        tracks.forEach((track) =>
          track.getAnimations()[0]?.updatePlaybackRate(rate),
        );
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ==========================================================================
   * 8 · CURSOR
   * ========================================================================*/
  function initCursor() {
    const dot = $("#cursor");
    const ring = $("#cursor-ring");
    const label = $("#cursor-label");
    if (!dot || !ring || !label || !pointerOK()) return;

    ROOT.classList.add("has-cursor", "cursor-hidden");

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let seen = false;

    const place = (el, x, y) =>
      (el.style.transform = `translate3d(${x}px, ${y}px, 0)`);

    on(document, "pointermove", (e) => {
      if (e.pointerType === "touch") return;
      mx = e.clientX;
      my = e.clientY;
      place(dot, mx, my);
      if (!seen) {
        seen = true;
        rx = mx;
        ry = my;
        ROOT.classList.remove("cursor-hidden");
      }
    });

    (function loop() {
      rx = lerp(rx, mx, 0.16);
      ry = lerp(ry, my, 0.16);
      place(ring, rx, ry);
      place(label, rx, ry);
      requestAnimationFrame(loop);
    })();

    const INTERACTIVE =
      "a, button, label, select, [role='button'], [data-cursor]";

    on(document, "pointerover", (e) => {
      const target = e.target.closest ? e.target : e.target.parentElement;
      const interactive = target?.closest(INTERACTIVE);
      const withLabel = target?.closest("[data-cursor]");
      const drag = target?.closest("[data-cursor-drag]");
      const text =
        withLabel?.dataset.cursor ||
        (!interactive || withLabel ? drag?.dataset.cursorDrag : "") ||
        "";

      ROOT.classList.toggle("cursor-hover", !!interactive);
      ROOT.classList.toggle("cursor-label", !!text);
      label.textContent = text;
    });

    on(document, "pointerdown", () => ROOT.classList.add("cursor-down"));
    on(document, "pointerup", () => ROOT.classList.remove("cursor-down"));
    on(document.documentElement, "mouseleave", () =>
      ROOT.classList.add("cursor-hidden"),
    );
    on(
      document.documentElement,
      "mouseenter",
      () => seen && ROOT.classList.remove("cursor-hidden"),
    );
  }

  /* ==========================================================================
   * 9 · MAGNETIC BUTTONS (spring physics via Motion when available)
   * ========================================================================*/
  function initMagnetic() {
    if (!pointerOK()) return;
    const animate =
      MOTION && typeof MOTION.animate === "function" ? MOTION.animate : null;

    $$(".magnetic").forEach((el) => {
      on(el, "pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx =
          (e.clientX - (r.left + r.width / 2)) * CONFIG.magneticStrength;
        const dy =
          (e.clientY - (r.top + r.height / 2)) * CONFIG.magneticStrength;

        if (animate)
          animate(
            el,
            { x: dx, y: dy },
            { type: "spring", stiffness: 260, damping: 18, mass: 0.6 },
          );
        else el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      });

      on(el, "pointerleave", () => {
        if (animate)
          animate(
            el,
            { x: 0, y: 0 },
            { type: "spring", stiffness: 180, damping: 12 },
          );
        else el.style.transform = "";
      });
    });
  }

  /* ==========================================================================
   * 10 · WORK: filter + 9:16 rail
   * ========================================================================*/
  function initWorkFilter() {
    const buttons = $$(".filter-btn");
    if (!buttons.length) return;

    const items = $$("[data-category]");
    const rail = $("#work-rail");

    buttons.forEach((btn) => {
      on(btn, "click", () => {
        const filter =
          btn.dataset.filter || btn.textContent.trim().toLowerCase();

        buttons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });

        items.forEach((item) => {
          const match =
            filter === "all" ||
            (item.dataset.category || "").split(/\s+/).includes(filter);
          item.hidden = !match;
          item.classList.toggle("is-hidden", !match);
        });

        if (rail) {
          rail.scrollTo({ left: 0 });
          rail.dispatchEvent(new Event("scroll"));
          if (HAS_GSAP && motionOK()) {
            G.fromTo(
              items.filter((i) => !i.hidden),
              { opacity: 0, y: 28 },
              {
                opacity: 1,
                y: 0,
                duration: 0.7,
                stagger: 0.05,
                ease: "power3.out",
                clearProps: "opacity,transform",
              },
            );
          }
        }
      });
    });
  }

  function initWorkRail() {
    const rail = $("#work-rail");
    if (!rail) return;

    const prev = $("#rail-prev");
    const next = $("#rail-next");
    const bar = $("#rail-progress-bar");

    const stepSize = () => {
      const item = $$(".work-item", rail).find((i) => !i.hidden);
      const gap = parseFloat(getComputedStyle(rail).columnGap) || 16;
      return item ? item.getBoundingClientRect().width + gap : 300;
    };

    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const p = max > 0 ? rail.scrollLeft / max : 1;
      if (bar) bar.style.transform = `scaleX(${clamp(0.12 + 0.88 * p, 0, 1)})`;
      if (prev) prev.disabled = rail.scrollLeft <= 2;
      if (next) next.disabled = rail.scrollLeft >= max - 2;
    };

    const scrollByCards = (dir) =>
      rail.scrollBy({
        left: dir * stepSize() * 2,
        behavior: motionOK() ? "smooth" : "auto",
      });

    on(prev, "click", () => scrollByCards(-1));
    on(next, "click", () => scrollByCards(1));
    on(rail, "scroll", update, { passive: true });
    on(window, "resize", update);

    /* Drag to scroll (mouse only; touch and trackpad scroll natively) */
    let down = false;
    let startX = 0;
    let startLeft = 0;
    let moved = 0;

    on(rail, "pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      moved = 0;
      startX = e.clientX;
      startLeft = rail.scrollLeft;
    });

    on(window, "pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 5) {
        rail.classList.add("is-dragging");
        rail.scrollLeft = startLeft - dx;
      }
    });

    on(window, "pointerup", () => {
      if (!down) return;
      down = false;
      if (moved > 5) {
        const block = (e) => e.preventDefault();
        rail.addEventListener("click", block, { capture: true });
        setTimeout(
          () => rail.removeEventListener("click", block, { capture: true }),
          60,
        );
      }
      rail.classList.remove("is-dragging");
    });

    update();
  }

  /* ==========================================================================
   * 11 · TESTIMONIALS
   * ========================================================================*/
  function initTestimonials() {
    const track = $("#testimonials-track");
    if (!track) return;

    const slides = $$(".testimonial-slide", track);
    if (!slides.length) return;

    const dots = $$(".testimonial-dot");
    const prevBtn = $("#prev-testimonial");
    const nextBtn = $("#next-testimonial");
    const viewport = track.parentElement;

    let index = 0;
    let timer = null;
    let touchStartX = 0;
    let userControlled = false;

    const goTo = (n) => {
      index = (n + slides.length) % slides.length;
      track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
      slides.forEach((slide, i) =>
        slide.setAttribute("aria-hidden", String(i !== index)),
      );
      dots.forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
        dot.setAttribute("aria-current", i === index ? "true" : "false");
      });
    };

    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      if (!motionOK() || userControlled) return;
      timer = setInterval(() => goTo(index + 1), CONFIG.testimonialAutoplay);
    };
    const manual = (n) => {
      userControlled = true; // respect the visitor: no more autoplay once they take over
      stop();
      goTo(n);
    };

    on(prevBtn, "click", () => manual(index - 1));
    on(nextBtn, "click", () => manual(index + 1));
    dots.forEach((dot, i) => on(dot, "click", () => manual(i)));

    on(
      track,
      "touchstart",
      (e) => {
        touchStartX = e.touches[0].clientX;
        stop();
      },
      { passive: true },
    );
    on(
      track,
      "touchend",
      (e) => {
        const delta = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > CONFIG.testimonialSwipeMin)
          manual(delta > 0 ? index - 1 : index + 1);
        else start();
      },
      { passive: true },
    );

    if (viewport) {
      viewport.tabIndex = 0;
      viewport.setAttribute("aria-label", "Testimonials");
      on(viewport, "keydown", (e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          manual(index - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          manual(index + 1);
        }
      });
      on(viewport, "mouseenter", stop);
      on(viewport, "mouseleave", start);
      on(viewport, "focusin", stop);
    }

    on(document, "visibilitychange", () =>
      document.hidden ? stop() : start(),
    );
    goTo(0);
    start();
  }

  /* ==========================================================================
   * 12 · FAQ
   * ========================================================================*/
  function initFAQ() {
    const questions = $$(".faq-question");
    if (!questions.length) return;

    const setState = (q, open) => {
      q.classList.toggle("open", open);
      q.setAttribute("aria-expanded", String(open));
      $(".faq-answer", q.closest(".faq-item"))?.classList.toggle("open", open);
    };

    questions.forEach((q) => {
      on(q, "click", () => {
        const willOpen = !q.classList.contains("open");
        questions.forEach((other) => other !== q && setState(other, false));
        setState(q, willOpen);
      });
    });
  }

  /* ==========================================================================
   * 13 · CONTACT FORM + NEWSLETTER
   * ========================================================================*/
  function initContactForm() {
    const form = $("#contact-form");
    if (!form) return;

    const endpoint = form.dataset.endpoint || "";
    const toEmail = form.dataset.email || "itxme204@gmail.com";
    const hasEndpoint =
      /^https?:\/\//.test(endpoint) && !/your-form-id/.test(endpoint);

    const okMsg = $("#form-success");
    const failMsg = $("#form-fail");
    const submitBtn = $(".form-submit", form);
    const okDefault = okMsg ? okMsg.textContent : "";
    const params = new URLSearchParams(window.location.search);

    const field = (id) => $(`#${id}`, form);
    const name = field("name");
    const email = field("email");
    const message = field("message");
    const service = field("service");
    const intent = field("intent");

    /* Prefill from the query string (?service=web&package=elite&project=...) */
    const serviceParam = params.get("service");
    if (
      service &&
      serviceParam &&
      $(`option[value="${CSS.escape(serviceParam)}"]`, service)
    )
      service.value = serviceParam;

    const intentValue =
      params.get("intent") ||
      params.get("package") ||
      params.get("project") ||
      params.get("case") ||
      params.get("topic");
    if (intent && intentValue) intent.value = intentValue.replace(/-/g, " ");

    if (message && params.get("project") && !message.value) {
      message.value = `Hi Xavier, I want to build something similar to ${params.get("project").replace(/-/g, " ")}.`;
    }

    /* Validation */
    const rules = {
      name: (v) => (v.trim() ? "" : "Please enter your name."),
      email: (v) =>
        !v.trim()
          ? "Please enter your email."
          : EMAIL_RE.test(v.trim())
            ? ""
            : "That email address looks incomplete.",
      message: (v) =>
        v.trim().length >= 10
          ? ""
          : "Tell me a little about the project (at least 10 characters).",
    };

    const check = (input) => {
      const rule = rules[input.name];
      if (!rule) return true;
      const error = rule(input.value);
      const slot = $(`#err-${input.name}`);
      input.setAttribute("aria-invalid", String(!!error));
      if (slot) slot.textContent = error;
      return !error;
    };

    [name, email, message].forEach((input) => {
      if (!input) return;
      on(input, "blur", () => input.value && check(input));
      on(
        input,
        "input",
        () => input.getAttribute("aria-invalid") === "true" && check(input),
      );
    });

    const showStatus = (kind, text) => {
      if (okMsg) okMsg.hidden = kind !== "ok";
      if (failMsg) failMsg.hidden = kind !== "fail";
      if (kind === "ok" && okMsg && text) okMsg.textContent = text;
    };

    const buildMailto = (data) => {
      const lines = [
        `Name: ${data.get("name") || ""}`,
        `Email: ${data.get("email") || ""}`,
        `Service: ${data.get("service") || "-"}`,
        `Budget: ${data.get("budget") || "-"}`,
        `Timeline: ${data.get("timeline") || "-"}`,
        data.get("intent") ? `Intent: ${data.get("intent")}` : "",
        "",
        data.get("message") || "",
      ].filter((l, i) => l !== "" || i > 5);
      return `mailto:${toEmail}?subject=${encodeURIComponent("New project enquiry")}&body=${encodeURIComponent(lines.join("\n"))}`;
    };

    on(form, "submit", async (e) => {
      e.preventDefault();
      showStatus("none");

      const results = [name, email, message].filter(Boolean).map(check);
      if (results.includes(false)) {
        [name, email, message]
          .find((i) => i && i.getAttribute("aria-invalid") === "true")
          ?.focus();
        return;
      }

      const data = new FormData(form);
      if (data.get("_gotcha")) return showStatus("ok"); // bot: pretend success

      const label = submitBtn ? $("span", submitBtn) : null;
      const original = label ? label.textContent : "";
      if (submitBtn) submitBtn.disabled = true;
      if (label) label.textContent = "Sending...";

      try {
        if (hasEndpoint) {
          const res = await fetch(endpoint, {
            method: "POST",
            body: data,
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`Form endpoint returned ${res.status}`);
          showStatus("ok", okDefault);
          form.reset();
        } else {
          window.location.href = buildMailto(data);
          showStatus(
            "ok",
            "Your email app should open with the message ready to send.",
          );
        }
      } catch (error) {
        console.error("[contact-form]", error);
        showStatus("fail");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (label) label.textContent = original;
      }
    });
  }

  function initNewsletter() {
    const input = $(".footer-newsletter-input");
    const button = $(".footer-newsletter-btn");
    if (!input || !button) return;

    const form = input.closest("form");
    const placeholder = input.placeholder;
    const endpoint = (form && form.dataset.endpoint) || "";
    const toEmail = (form && form.dataset.email) || "hello@xavier.com";

    const note = (text, ms = 3500) => {
      input.placeholder = text;
      setTimeout(() => (input.placeholder = placeholder), ms);
    };

    const handle = async (e) => {
      e.preventDefault();
      const value = input.value.trim();

      if (!EMAIL_RE.test(value)) {
        input.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return note("Enter a valid email address");
      }
      input.classList.remove("is-invalid");
      input.removeAttribute("aria-invalid");

      if (/^https?:\/\//.test(endpoint)) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            body: JSON.stringify({ email: value }),
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          });
          if (!res.ok) throw new Error(String(res.status));
          input.value = "";
          return note("Subscribed. Thank you!");
        } catch {
          return note("Couldn't subscribe. Try again soon.");
        }
      }

      // No newsletter service configured yet: send the request by email instead of faking success.
      window.location.href = `mailto:${toEmail}?subject=${encodeURIComponent("Newsletter signup")}&body=${encodeURIComponent(`Please add me to the newsletter: ${value}`)}`;
      input.value = "";
      note("Check your email app to confirm");
    };

    if (form) on(form, "submit", handle);
    else on(button, "click", handle);
  }

  /* ==========================================================================
   * 14 · SHOWREEL PLAYER
   * ========================================================================*/
  function initReel() {
    const container = $("#reel-container");
    if (!container) return;

    const playBtn = $(".reel-play-btn", container);
    const thumbnail = $(".reel-thumbnail", container);
    const overlay = $(".reel-overlay", container);
    const label = $(".reel-label", container);
    const duration = $(".reel-duration", container);
    if (!playBtn) return;

    // The video file comes from data-video on #reel-container.
    const SRC = container.dataset.video;
    if (!SRC) return;

    const cursorLabel = container.dataset.cursor;
    const fmt = (s) =>
      `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    let video = null;

    const showCover = () => {
      if (thumbnail) thumbnail.style.opacity = "";
      if (overlay) overlay.style.opacity = "";
      if (cursorLabel) container.dataset.cursor = cursorLabel;
      container.classList.remove("is-playing");
    };

    const build = () => {
      video = document.createElement("video");
      video.src = SRC;
      video.poster = thumbnail ? thumbnail.currentSrc || thumbnail.src : "";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", "Xavier showreel");
      Object.assign(video.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: "1",
        background: "#000",
      });

      // Show the real length of the file instead of a typed-in number.
      video.addEventListener("loadedmetadata", () => {
        if (duration && isFinite(video.duration))
          duration.textContent = fmt(video.duration);
      });
      video.addEventListener("ended", () => {
        video.remove();
        video = null;
        showCover();
      });
      video.addEventListener("error", () => {
        video?.remove();
        video = null;
        showCover();
        if (label) label.textContent = "Showreel video unavailable";
      });

      container.appendChild(video);
      container.classList.add("is-playing");
      container.removeAttribute("data-cursor"); // no "Play" bubble over the native controls
      ROOT.classList.remove("cursor-label");
      if (thumbnail) thumbnail.style.opacity = "0";
      if (overlay) overlay.style.opacity = "0";
    };

    on(playBtn, "click", () => {
      if (!video) build();
      // Started by a click, so the browser allows sound.
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    });
  }

  /* ==========================================================================
   * 15 · SMOOTH ANCHORS
   * ========================================================================*/
  function initAnchors() {
    on(document, "click", (e) => {
      const link = e.target.closest?.('a[href^="#"]');
      if (!link) return;

      const hash = link.getAttribute("href");
      let target = null;

      if (hash === "#" || hash === "#top") {
        target = document.body;
      } else {
        try {
          target = $(hash);
        } catch {
          return;
        }
      }
      if (!target) return;

      e.preventDefault();
      const top =
        target === document.body
          ? 0
          : target.getBoundingClientRect().top +
            window.scrollY -
            CONFIG.navOffset;

      if (lenis) lenis.scrollTo(top, { duration: 1.4 });
      else window.scrollTo({ top, behavior: motionOK() ? "smooth" : "auto" });

      if (hash.length > 1) history.pushState(null, "", hash);
    });
  }

  /* ==========================================================================
   * 16 · COOKIE NOTICE + MULTI-PAGE HELPERS
   * ========================================================================*/
  function initCookieConsent() {
    if (store.get("cookie-consent") === "accepted" || $("#cookie-banner"))
      return;

    const inPages = /\/pages\//i.test(window.location.pathname);
    const cookieHref = `${inPages ? "" : "Pages/"}cookies.html`;

    const banner = document.createElement("aside");
    banner.id = "cookie-banner";
    banner.className = "cookie-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookie notice");
    banner.innerHTML = `
      <p class="cookie-banner__text">We use cookies to improve your experience. <a href="${cookieHref}">Learn more</a></p>
      <button type="button" class="cookie-banner__accept">Accept</button>`;

    // Wait until the intro is over so it never competes with the hero.
    setTimeout(() => document.body.appendChild(banner), 2500);

    on(banner, "click", (e) => {
      if (!e.target.closest(".cookie-banner__accept")) return;
      store.set("cookie-consent", "accepted");
      banner.remove();
    });
  }

  function initMultiPageHelpers() {
    const current = (
      window.location.pathname.split("/").pop() || "index.html"
    ).toLowerCase();

    const isActive = (href) => {
      const target = href
        .split("#")[0]
        .split("?")[0]
        .split("/")
        .pop()
        .toLowerCase();
      if (!target) return false;
      if (target === current) return true;
      if (current.startsWith("work-") && target === "work.html") return true;
      if (
        current.startsWith("case-") &&
        (target === "clients.html" || target === "case-studies.html")
      )
        return true;
      return false;
    };

    $$(".nav-link, .mobile-menu-link, .footer-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || /^(https?:|mailto:|tel:)/.test(href))
        return;

      const active = isActive(href);
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    $$('a[target="_blank"]').forEach((link) => {
      const rel = new Set((link.rel || "").split(/\s+/).filter(Boolean));
      rel.add("noopener");
      rel.add("noreferrer");
      link.rel = [...rel].join(" ");
    });
  }

  /* ==========================================================================
   * 17 · BOOT
   * ========================================================================*/
  ready(() => {
    resolveAnimMode();
    safe(initSmoothScroll);
    safe(initPreloader); // gates the intro animations
    safe(initCursor);
    safe(initScrollUI);
    safe(initMenu);
    safe(initHeroFrame);
    safe(initHeroLight);
    safe(initMarquee);
    safe(initTestimonials);
    safe(initWorkFilter);
    safe(initWorkRail);
    safe(initFAQ);
    safe(initContactForm);
    safe(initNewsletter);
    safe(initMagnetic);
    safe(initAnchors);
    safe(initReel);
    safe(initCookieConsent);
    safe(initMultiPageHelpers);
  });
})();
