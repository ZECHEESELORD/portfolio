(() => {
  const gridEl = document.querySelector("#projectGrid");
  const filtersEl = document.querySelector("#projectFilters");
  const detailOverlay = document.querySelector("#detailOverlay");
  const detailPanel = document.querySelector("#detailOverlay .overlay__panel");
  const detailContent = document.querySelector("#detailContent");
  const detailSidebar = document.querySelector("#detailSidebar");
  const detailTitle = document.querySelector("#detailTitle");
  const detailDate = document.querySelector("#detailDate");
  const detailGithub = document.querySelector("#detailGithub");
  const statusEl = document.querySelector("#statusMessage");
  const postsCache = new Map();
  const activeTags = new Set();
  let allPosts = [];
  const isFileProtocol = window.location.protocol === "file:";
  const lightbox = createLightbox();

  const KIND_LABEL = {
    case: "Case Study",
    oss: "Open Source",
    experiment: "Experiment",
    client: "Client Work",
  };

  const KIND_CLASS = {
    case: "kind--case",
    oss: "kind--oss",
    experiment: "kind--experiment",
    client: "kind--client",
  };

  const FILTER_TAGS = [
    "Paper",
    "Fabric",
    "Velocity",
    "Server Systems",
    "Networking",
    "Tooling",
    "Game Design",
    "Performance",
    "Twitch Integration",
    "Modding",
    "Open Source",
    "Packets",
  ];

  const TAG_COLOR = {
    Paper: "c-green",
    Fabric: "c-green",
    Velocity: "c-green",
    "Server Systems": "c-green",
    Modding: "c-green",
    Networking: "c-blue",
    "Twitch Integration": "c-blue",
    Packets: "c-blue",
    Performance: "c-gold",
    Tooling: "c-teal",
    "Open Source": "c-teal",
    "Game Design": "c-plum",
  };

  configureMarkdown();

  const scrollButtons = document.querySelectorAll("[data-scroll]");
  scrollButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-scroll");
      if (!target) return;
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
    });
  });

  document
    .querySelector(".detail__close")
    ?.addEventListener("click", () => closeDetail(true));

  detailOverlay?.querySelector(".overlay__backdrop")?.addEventListener("click", () => {
    closeDetail(false);
  });

  detailContent?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const img = target.closest("img");
    if (img && img.src) {
      openLightbox(img.src, img.alt || img.title || "");
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (lightbox.root && !lightbox.root.hidden) {
        closeLightbox();
        return;
      }
    }
    if (event.key === "Escape" && detailOverlay && !detailOverlay.hidden) {
      closeDetail(true);
    }
  });

  async function boot() {
    if (isFileProtocol) {
      setStatus("file:// may block markdown fetch. Run a local server for best results.", "warn");
    }

    setStatus("Loading projects...");
    try {
      const index = await fetchJson("posts/index.json");
      if (!Array.isArray(index) || !index.length) {
        setStatus("No posts found in posts/index.json", "warn");
        return;
      }
      const posts = (await Promise.all(index.map((entry) => loadPost(entry)))).filter(Boolean);
      const sorted = posts.sort((a, b) => getDateValue(b.published) - getDateValue(a.published));
      postsCache.clear();
      for (const post of sorted) {
        postsCache.set(post.slug, post);
      }
      allPosts = sorted;
      updateProjectView();
    } catch (error) {
      console.error(error);
      setStatus("Failed to load posts. Serve locally (http) to allow markdown fetch.", "error");
    }
  }

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Unable to fetch ${path} (${res.status})`);
    return res.json();
  }

  async function loadPost(entry) {
    const path = entry.file ? `posts/${entry.file}` : "";
    if (!path) return null;
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Unable to fetch ${path} (${res.status})`);
    const text = await res.text();
    return buildPost(entry, text, path);
  }

  function parseFrontmatter(text) {
    const frontmatterMatch = text.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*/);
    if (!frontmatterMatch) {
      return { meta: {}, content: text };
    }
    const raw = frontmatterMatch[1];
    const meta = {};
    raw.split(/\r?\n/).forEach((line) => {
      if (!line.trim() || !line.includes(":")) return;
      const [key, ...rest] = line.split(":");
      meta[key.trim()] = rest.join(":").trim();
    });
    const content = text.slice(frontmatterMatch[0].length);
    return { meta, content };
  }

  function buildPost(entry, text, path) {
    const { meta, content } = parseFrontmatter(text);
    const base = new URL(path, window.location.href);
    const imageValue = cleanMetaValue(meta.image);
    const image = imageValue ? new URL(imageValue, base).href : "";
    const slug = entry.slug || slugify(meta.title || path);
    const title = cleanMetaValue(meta.title) || "Untitled build";
    const mono = parseList(meta.mono);
    return {
      slug,
      title,
      image,
      published: cleanMetaValue(meta.published),
      year: cleanMetaValue(meta.year) || getYear(meta.published),
      github: cleanMetaValue(meta.github),
      kind: cleanMetaValue(meta.kind) || "case",
      tags: parseList(meta.tags),
      role: cleanMetaValue(meta.role) || "Implementation and technical direction.",
      stack: parseList(meta.stack),
      mono: mono.length >= 2 ? mono.slice(0, 2) : ["#cdd3e0", "#aeb6c8"],
      initials: cleanMetaValue(meta.initials) || getInitials(title),
      summary: cleanMetaValue(meta.summary) || deriveSummary(content),
      content: content.trim(),
      sourcePath: path,
    };
  }

  function updateProjectView() {
    renderFilters();
    const visible = getVisiblePosts();
    renderProjectGrid(visible);
    const total = allPosts.length;
    const shown = visible.length;
    if (activeTags.size) {
      setStatus(`Showing ${shown} of ${total} project${total === 1 ? "" : "s"}.`, "ok");
    } else {
      setStatus(`Loaded ${total} project${total === 1 ? "" : "s"}.`, "ok");
    }
  }

  function getVisiblePosts() {
    if (!activeTags.size) return allPosts;
    return allPosts.filter((post) => post.tags.some((tag) => activeTags.has(tag)));
  }

  function renderProjectGrid(posts) {
    gridEl.innerHTML = "";
    if (!posts.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No projects match those tags. Try clearing a filter.";
      gridEl.appendChild(empty);
      return;
    }
    for (const post of posts) {
      renderTile(post);
    }
  }

  function renderFilters() {
    if (!filtersEl) return;
    const counts = new Map(FILTER_TAGS.map((tag) => [tag, 0]));
    allPosts.forEach((post) => {
      post.tags.forEach((tag) => {
        if (counts.has(tag)) counts.set(tag, counts.get(tag) + 1);
      });
    });

    filtersEl.innerHTML = "";
    if (!allPosts.some((post) => post.tags.length)) {
      filtersEl.hidden = true;
      return;
    }
    filtersEl.hidden = false;

    const label = document.createElement("span");
    label.className = "filter__label";
    label.textContent = "Filter";
    filtersEl.appendChild(label);

    FILTER_TAGS.forEach((tag) => {
      const count = counts.get(tag) || 0;
      if (!count) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip ${TAG_COLOR[tag] || "c-green"}`;
      chip.dataset.on = activeTags.has(tag) ? "true" : "false";
      chip.setAttribute("aria-pressed", activeTags.has(tag) ? "true" : "false");
      chip.append(document.createTextNode(tag));

      const countEl = document.createElement("span");
      countEl.className = "chip__count";
      countEl.textContent = String(count);
      chip.appendChild(countEl);

      chip.addEventListener("click", () => {
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
        } else {
          activeTags.add(tag);
        }
        updateProjectView();
      });
      filtersEl.appendChild(chip);
    });

    if (activeTags.size) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "chip chip--clear";
      clear.textContent = `Clear (${activeTags.size})`;
      clear.addEventListener("click", () => {
        activeTags.clear();
        updateProjectView();
      });
      filtersEl.appendChild(clear);
    }
  }

  function renderTile(post) {
    const tile = document.createElement("button");
    tile.className = "card";
    tile.type = "button";
    if (post.mono?.length >= 2) {
      tile.style.setProperty("--mono-a", post.mono[0]);
      tile.style.setProperty("--mono-b", post.mono[1]);
    }
    const cover = post.image ? normalizePath(post.image) : "";
    tile.setAttribute("aria-label", `Open case study: ${post.title}`);

    tile.innerHTML = `
      <div class="card__media">
        ${
          cover
            ? `<img class="card__img" src="${escapeHtml(cover)}" alt="${escapeHtml(post.title)} screenshot" loading="lazy">`
            : getMonogramMarkup(post)
        }
        <div class="card__scrim"></div>
      </div>
      <div class="card__top">
        <span class="kind ${KIND_CLASS[post.kind] || KIND_CLASS.case}">${KIND_LABEL[post.kind] || KIND_LABEL.case}</span>
        <span class="card__year">${escapeHtml(post.year || post.published || "Markdown")}</span>
      </div>
      <div class="card__body">
        <h3 class="card__title">${escapeHtml(post.title)}</h3>
        <div class="card__reveal">
          <div class="card__reveal-inner">
            ${post.summary ? `<p class="card__summary">${escapeHtml(post.summary)}</p>` : ""}
            ${
              post.tags.length
                ? `<div class="card__tags">${post.tags.slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
                : ""
            }
          </div>
        </div>
      </div>
    `;

    const activate = () => openPost(post.slug);
    tile.addEventListener("click", activate);
    tile.querySelector(".card__img")?.addEventListener("error", () => {
      const media = tile.querySelector(".card__media");
      if (!media) return;
      media.innerHTML = `${getMonogramMarkup(post)}<div class="card__scrim"></div>`;
    });

    gridEl.appendChild(tile);
  }

  function parseList(value) {
    const cleaned = cleanMetaValue(value);
    if (!cleaned) return [];
    return cleaned
      .split(",")
      .map((item) => cleanMetaValue(item))
      .filter(Boolean);
  }

  function cleanMetaValue(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  function deriveSummary(content) {
    const blocks = content
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    for (const block of blocks) {
      if (/^#{1,6}\s/.test(block)) continue;
      if (/^```/.test(block)) continue;
      if (/^\|/.test(block)) continue;
      if (/^</.test(block)) continue;

      const cleaned = cleanMarkdownText(block);
      if (cleaned.length >= 40) {
        return truncateText(cleaned, 170);
      }
    }
    return "";
  }

  function cleanMarkdownText(value) {
    return value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/[*_~>#]/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateText(value, maxLength) {
    if (value.length <= maxLength) return value;
    const trimmed = value.slice(0, maxLength - 1);
    const lastSpace = trimmed.lastIndexOf(" ");
    return `${trimmed.slice(0, lastSpace > 80 ? lastSpace : trimmed.length).trim()}...`;
  }

  function getMonogramMarkup(post) {
    return `<div class="card__mono"><span>${escapeHtml(post.initials || getInitials(post.title))}</span></div>`;
  }

  function getInitials(value) {
    return value
      .replace(/\([^)]*\)/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "Z";
  }

  function getYear(value) {
    if (!value) return "";
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return String(new Date(parsed).getFullYear());
    }
    const match = value.match(/\b(20\d{2})\b/);
    return match ? match[1] : "";
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openPost(slug) {
    const post = postsCache.get(slug);
    if (!post || !detailOverlay) return;
    if (detailPanel) {
      detailPanel.classList.remove("is-closing");
      detailPanel.classList.remove("is-opening");
      // Force reflow so the opening animation restarts
      void detailPanel.offsetWidth;
      detailPanel.classList.add("is-opening");
    }
    detailOverlay.hidden = false;
    const hero = post.image
      ? `url('${normalizePath(post.image)}')`
      : `radial-gradient(120% 120% at 30% 20%, ${post.mono?.[0] || "#cdd3e0"}, ${post.mono?.[1] || "#aeb6c8"})`;
    detailPanel.style.setProperty("--hero", hero);
    detailTitle.textContent = post.title;
    detailDate.textContent = [KIND_LABEL[post.kind] || KIND_LABEL.case, post.published || post.year]
      .filter(Boolean)
      .join(" / ");
    if (detailGithub) {
      if (post.github) {
        detailGithub.href = post.github;
        detailGithub.hidden = false;
      } else {
        detailGithub.hidden = true;
      }
    }

    if (window.marked) {
      detailContent.innerHTML = window.marked.parse(post.content || "");
    } else {
      detailContent.textContent = post.content || "";
    }
    renderSidebar(post);
    if (window.MathJax && window.MathJax.typesetPromise) {
      const mathTargets = detailSidebar ? [detailContent, detailSidebar] : [detailContent];
      window.MathJax.typesetPromise(mathTargets).catch((err) =>
        console.error("MathJax render error", err)
      );
    }
    enhanceImages(detailContent);
    enhanceTables(detailContent);
    document.body.classList.add("overlay-open");
    requestAnimationFrame(() => document.body.classList.add("overlay-blur"));
    // Ensure modal content starts at the top when opened
    detailPanel?.scrollTo({ top: 0 });
    detailContent.scrollTop = 0;
  }

  function closeDetail(scrollToGrid) {
    if (!detailOverlay) return;
    if (detailOverlay.hidden) return;
    document.body.classList.remove("overlay-blur");
    let closed = false;
    const finishClose = () => {
      if (closed) return;
      closed = true;
      detailPanel?.classList.remove("is-closing");
      detailOverlay.hidden = true;
      detailContent.innerHTML = "";
      if (detailSidebar) detailSidebar.innerHTML = "";
      document.body.classList.remove("overlay-open");
      closeLightbox();
      if (scrollToGrid) {
        gridEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    if (detailPanel) {
      detailPanel.classList.remove("is-opening");
      detailPanel.classList.add("is-closing");
      const fallback = setTimeout(finishClose, 450);
      detailPanel.addEventListener(
        "animationend",
        () => {
          clearTimeout(fallback);
          finishClose();
        },
        { once: true }
      );
    } else {
      finishClose();
    }
  }

  function normalizePath(path) {
    try {
      return new URL(path, window.location.href).href;
    } catch (err) {
      return path;
    }
  }

  function renderSidebar(post) {
    if (!detailSidebar) return;
    const stack = post.stack?.length ? post.stack : post.tags;
    const released = post.published || post.year || "Unlisted";
    const type = KIND_LABEL[post.kind] || KIND_LABEL.case;
    const linkCard = post.github
      ? `
        <div class="side-card">
          <p class="side-card__label">Links</p>
          <div class="cs-links">
            <a class="button button--solid button--sm" href="${escapeHtml(post.github)}" target="_blank" rel="noopener">
              <span class="icon-github" aria-hidden="true"></span>
              View Source
            </a>
          </div>
        </div>
      `
      : "";

    detailSidebar.innerHTML = `
      <div class="side-card">
        <p class="side-card__label">Role</p>
        <p class="body">${escapeHtml(post.role)}</p>
        <dl class="kv-list">
          <div class="kv"><dt>Released</dt><dd>${escapeHtml(released)}</dd></div>
          <div class="kv"><dt>Type</dt><dd>${escapeHtml(type)}</dd></div>
        </dl>
      </div>

      ${
        stack.length
          ? `
            <div class="side-card">
              <p class="side-card__label">Stack</p>
              <div class="stack-list">
                ${stack.map((item) => `<span class="tag tag--light">${escapeHtml(item)}</span>`).join("")}
              </div>
            </div>
          `
          : ""
      }

      ${
        post.tags.length
          ? `
            <div class="side-card">
              <p class="side-card__label">Tags</p>
              <div class="stack-list">
                ${post.tags.map((tag) => `<span class="tag tag--light">${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
          `
          : ""
      }

      ${linkCard}
    `;
  }

  function setStatus(message, tone = "info") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  function getDateValue(value) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function configureMarkdown() {
    if (!window.marked) return;
    window.marked.setOptions({
      gfm: true,
      breaks: false,
      headerIds: false,
      mangle: false,
    });
  }

  function createLightbox() {
    const root = document.createElement("div");
    root.className = "lightbox";
    root.hidden = true;

    const frame = document.createElement("figure");
    frame.className = "lightbox__frame";

    const img = document.createElement("img");
    img.className = "lightbox__img";
    img.alt = "";

    const caption = document.createElement("figcaption");
    caption.className = "lightbox__caption";

    const closeBtn = document.createElement("button");
    closeBtn.className = "lightbox__close";
    closeBtn.type = "button";
    closeBtn.textContent = "Close";

    frame.appendChild(img);
    frame.appendChild(closeBtn);
    frame.appendChild(caption);
    root.appendChild(frame);

    root.addEventListener("click", (event) => {
      if (event.target === root) {
        closeLightbox();
      }
    });

    closeBtn.addEventListener("click", () => closeLightbox());

    document.body.appendChild(root);
    return { root, img, caption };
  }

  function openLightbox(src, altText) {
    if (!lightbox.root) return;
    lightbox.img.src = src;
    lightbox.img.alt = altText || "";
    lightbox.caption.textContent = altText || "";
    lightbox.root.hidden = false;
    document.body.classList.add("lightbox-open");
  }

  function closeLightbox() {
    if (!lightbox.root || lightbox.root.hidden) return;
    lightbox.root.hidden = true;
    document.body.classList.remove("lightbox-open");
  }

  function enhanceImages(container) {
    const imgs = container.querySelectorAll("img");
    imgs.forEach((img) => {
      const altText = img.getAttribute("alt") || img.getAttribute("title") || "";
      if (!altText) return;
      let figure = img.closest("figure");
      if (!figure) {
        figure = document.createElement("figure");
        img.replaceWith(figure);
        figure.appendChild(img);
      }
      figure.classList.add("hover-caption");
      let caption = figure.querySelector("figcaption");
      if (!caption) {
        caption = document.createElement("figcaption");
        figure.appendChild(caption);
      }
      caption.textContent = altText;
    });
  }

  function enhanceTables(container) {
    const tables = container.querySelectorAll("table");
    tables.forEach((table) => {
      if (table.parentElement?.classList.contains("table-wrapper")) return;
      const wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });
  }

  boot();
})();
