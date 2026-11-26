const answerContent = {
  overview: {
    kicker: "Overview",
    title: "Get the big picture, fast.",
    copy: "Confirm the store platform, review public store details, and see detected apps, theme evidence, and audit issues in one place.",
    points: ["Store and platform summary", "Apps and technologies count", "Shopify theme and audit signals when available"],
    image: "/landing-v2/assets/product/overview.png",
    imageAlt: "WeLookup Overview interface",
  },
  technology: {
    kicker: "Technology",
    title: "Reveal the technology behind the store.",
    copy: "Match public storefront signals against 8,244 technology signatures, including 873 Shopify apps, across platforms, analytics, marketing, reviews, support, payments, and more.",
    points: ["Complete public-page signal scan", "8,244 signatures, including 873 Shopify apps", "Search, category filters, and confidence"],
    image: "/landing-v2/assets/product/technology.png",
    imageAlt: "WeLookup Technology interface",
  },
  products: {
    kicker: "Products",
    title: "Explore the public catalog.",
    copy: "On a confirmed Shopify storefront, scan products and collections, search the result, review pricing, and export the findings.",
    points: ["Quick and full scan modes", "Product and collection search", "CSV export and pricing summary"],
    image: "/landing-v2/assets/product/products.png",
    imageAlt: "WeLookup Products interface",
  },
  audit: {
    kicker: "Audit",
    title: "Check AI and search readiness.",
    copy: "Review whether a confirmed Shopify storefront is easy for AI agents and search assistants to understand and use.",
    points: ["Readiness score out of 100", "Passed, warning, and failed checks", "Plain-language findings to review"],
    image: "/landing-v2/assets/product/audit.png",
    imageAlt: "WeLookup Audit interface",
  },
};

const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const navigation = document.querySelector("[data-navigation]");
const answerTabs = Array.from(document.querySelectorAll("[data-answer-tab]"));
const answerPanel = document.getElementById("answer-panel");
const answerKicker = document.querySelector("[data-answer-kicker]");
const answerTitle = document.querySelector("[data-answer-title]");
const answerCopy = document.querySelector("[data-answer-copy]");
const answerPoints = document.querySelector("[data-answer-points]");
const answerImage = document.querySelector("[data-answer-image]");
const answerWindow = document.querySelector("[data-answer-window]");
const answerShot = answerImage?.closest(".answer-shot");
const scrollCta = document.querySelector("[data-scroll-cta]");
const scrollCtaClose = document.querySelector("[data-scroll-cta-close]");
const hero = document.querySelector(".hero");
const heroCarousel = document.querySelector("[data-hero-carousel]");
const heroPanels = Array.from(document.querySelectorAll("[data-hero-panel]"));
const heroCarouselControls = Array.from(document.querySelectorAll("[data-hero-carousel-control]"));
const heroAppOrbs = Array.from(document.querySelectorAll(".hero-app-orb"));
const scrollCtaDismissedKey = "welookup-landing-v2-scroll-cta-dismissed";
let scrollCtaDismissed = sessionStorage.getItem(scrollCtaDismissedKey) === "true";
let scrollCtaShown = false;

function enableHeroCarousel() {
  if (!heroCarousel || heroPanels.length < 2) return;

  const slots = ["front", "next", "back", "previous"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let rotationTimer = 0;
  let pointerPaused = false;
  let focusPaused = false;

  function renderCarousel(nextIndex) {
    activeIndex = (nextIndex + heroPanels.length) % heroPanels.length;

    heroPanels.forEach((panel, panelIndex) => {
      const relativeIndex = (panelIndex - activeIndex + heroPanels.length) % heroPanels.length;
      panel.dataset.stackSlot = slots[relativeIndex] || "back";
      panel.setAttribute("aria-hidden", String(relativeIndex !== 0));
    });

    heroCarouselControls.forEach((control, controlIndex) => {
      control.setAttribute("aria-pressed", String(controlIndex === activeIndex));
    });
  }

  function stopRotation() {
    window.clearInterval(rotationTimer);
    rotationTimer = 0;
  }

  function startRotation() {
    stopRotation();
    if (reducedMotion.matches || pointerPaused || focusPaused || document.hidden) return;
    rotationTimer = window.setInterval(() => renderCarousel(activeIndex + 1), 4500);
  }

  heroCarouselControls.forEach((control, controlIndex) => {
    control.addEventListener("click", () => {
      renderCarousel(controlIndex);
      startRotation();
    });
  });

  heroCarousel.addEventListener("pointerenter", () => {
    pointerPaused = true;
    stopRotation();
  });

  heroCarousel.addEventListener("pointerleave", () => {
    pointerPaused = false;
    startRotation();
  });

  heroCarousel.addEventListener("focusin", () => {
    focusPaused = true;
    stopRotation();
  });

  heroCarousel.addEventListener("focusout", () => {
    window.requestAnimationFrame(() => {
      focusPaused = heroCarousel.contains(document.activeElement);
      startRotation();
    });
  });

  document.addEventListener("visibilitychange", startRotation);
  reducedMotion.addEventListener?.("change", startRotation);

  renderCarousel(0);
  startRotation();
}

function enableHeroAppParallax() {
  if (!hero || !heroAppOrbs.length) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let pointerX = 0;
  let pointerY = 0;
  let animationFrame = 0;
  const orbMotion = heroAppOrbs.map((orb) => ({
    orb,
    motionX: Number(orb.dataset.motionX) || 0,
    motionY: Number(orb.dataset.motionY) || 0,
    cross: Number(orb.dataset.cross) || 0,
    turn: Number(orb.dataset.turn) || 0,
    lag: Number(orb.dataset.lag) || 0.07,
    currentX: 0,
    currentY: 0,
    currentTurn: 0,
  }));

  function renderParallax() {
    let isMoving = false;

    orbMotion.forEach((motion) => {
      const targetX = pointerX * 36 * motion.motionX + pointerY * 16 * motion.cross;
      const targetY = pointerY * 28 * motion.motionY - pointerX * 14 * motion.cross;
      const targetTurn = pointerX * 5 * motion.turn + pointerY * 3 * motion.cross;

      motion.currentX += (targetX - motion.currentX) * motion.lag;
      motion.currentY += (targetY - motion.currentY) * motion.lag;
      motion.currentTurn += (targetTurn - motion.currentTurn) * motion.lag;

      motion.orb.style.setProperty("--app-parallax-x", `${motion.currentX.toFixed(2)}px`);
      motion.orb.style.setProperty("--app-parallax-y", `${motion.currentY.toFixed(2)}px`);
      motion.orb.style.setProperty("--app-parallax-rotate", `${motion.currentTurn.toFixed(2)}deg`);

      if (Math.abs(targetX - motion.currentX) > 0.02 || Math.abs(targetY - motion.currentY) > 0.02 || Math.abs(targetTurn - motion.currentTurn) > 0.02) {
        isMoving = true;
      }
    });

    if (isMoving) {
      animationFrame = window.requestAnimationFrame(renderParallax);
      return;
    }

    animationFrame = 0;
  }

  function queueParallax() {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(renderParallax);
  }

  hero.addEventListener("pointermove", (event) => {
    const bounds = hero.getBoundingClientRect();
    pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
    pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;
    queueParallax();
  }, { passive: true });

  hero.addEventListener("pointerleave", () => {
    pointerX = 0;
    pointerY = 0;
    queueParallax();
  });
}

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function updateScrollCta() {
  if (!scrollCta || scrollCtaDismissed || scrollCtaShown || window.scrollY < 360) return;

  scrollCtaShown = true;
  scrollCta.hidden = false;
  requestAnimationFrame(() => scrollCta.classList.add("is-visible"));
}

function dismissScrollCta() {
  if (!scrollCta) return;

  scrollCtaDismissed = true;
  sessionStorage.setItem(scrollCtaDismissedKey, "true");
  scrollCta.classList.remove("is-visible");
  window.setTimeout(() => {
    scrollCta.hidden = true;
  }, 220);
}

scrollCtaClose?.addEventListener("click", dismissScrollCta);

function closeMenu() {
  menuButton?.setAttribute("aria-expanded", "false");
  navigation?.classList.remove("is-open");
  const icon = menuButton?.querySelector(".material-symbols-rounded");
  if (icon) icon.textContent = "menu";
}

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  navigation?.classList.toggle("is-open", !isOpen);
  const icon = menuButton.querySelector(".material-symbols-rounded");
  if (icon) icon.textContent = isOpen ? "menu" : "close";
});

navigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

function selectAnswer(key, shouldFocus = false) {
  const content = answerContent[key];
  if (!content || !answerPanel) return;

  answerTabs.forEach((tab) => {
    const selected = tab.dataset.answerTab === key;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && shouldFocus) tab.focus();
  });

  const selectedTab = answerTabs.find((tab) => tab.dataset.answerTab === key);
  answerPanel.setAttribute("aria-labelledby", selectedTab?.id || "");
  answerKicker.textContent = content.kicker;
  answerTitle.textContent = content.title;
  answerCopy.textContent = content.copy;
  answerPoints.replaceChildren(...content.points.map((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    return item;
  }));

  if (answerImage) {
    answerShot?.classList.add("is-changing");
    window.setTimeout(() => {
      answerImage.src = content.image;
      answerImage.alt = content.imageAlt;
      answerWindow.textContent = content.kicker.toUpperCase();
      answerShot?.classList.remove("is-changing");
    }, 120);
  }
}

answerTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectAnswer(tab.dataset.answerTab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + answerTabs.length) % answerTabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % answerTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = answerTabs.length - 1;
    selectAnswer(answerTabs[nextIndex].dataset.answerTab, true);
  });
});

window.addEventListener("scroll", () => {
  updateHeader();
  updateScrollCta();
}, { passive: true });
window.addEventListener("resize", () => {
  if (window.innerWidth > 960) closeMenu();
});

updateHeader();
updateScrollCta();
enableHeroAppParallax();
enableHeroCarousel();
