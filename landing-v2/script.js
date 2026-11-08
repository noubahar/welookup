const answerContent = {
  overview: {
    kicker: "Overview",
    title: "Get the big picture, fast.",
    copy: "See store details, every detected technology and app, the Shopify theme when confirmed, and audit issues in one place.",
    placeholder: "Media placeholder — Overview walkthrough",
  },
  technology: {
    kicker: "Technology",
    title: "Reveal the tech behind the store.",
    copy: "Identify platforms, apps, analytics, marketing tools, and commerce technologies on the current page.",
    placeholder: "Media placeholder — Technology walkthrough",
  },
  products: {
    kicker: "Products",
    title: "Explore the public catalog.",
    copy: "Run a quick or full Shopify catalog scan, search products and collections, and export the results.",
    placeholder: "Media placeholder — Products walkthrough",
  },
  audit: {
    kicker: "Audit",
    title: "Check AI and search readiness.",
    copy: "Review whether a Shopify storefront is easy for AI agents and search assistants to understand and use.",
    placeholder: "Media placeholder — Audit walkthrough",
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
const answerPlaceholder = document.querySelector("[data-answer-placeholder]");

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

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
  answerPlaceholder.querySelector("span").textContent = content.placeholder;
  answerPlaceholder.setAttribute("aria-label", content.placeholder);
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

window.addEventListener("scroll", updateHeader, { passive: true });
window.addEventListener("resize", () => {
  if (window.innerWidth > 960) closeMenu();
});

updateHeader();
