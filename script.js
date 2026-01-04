(() => {
  const gridEl = document.querySelector("#projectGrid");
  const detailOverlay = document.querySelector("#detailOverlay");
  const detailPanel = document.querySelector("#detailOverlay .overlay__panel");
  const detailContent = document.querySelector("#detailContent");
  const detailTitle = document.querySelector("#detailTitle");
  const detailDate = document.querySelector("#detailDate");
  const detailGithub = document.querySelector("#detailGithub");
  const statusEl = document.querySelector("#statusMessage");
  const postsCache = new Map();
  const isFileProtocol = window.location.protocol === "file:";
  const lightbox = createLightbox();

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
      gridEl.innerHTML = "";
      for (const post of sorted) {
        postsCache.set(post.slug, post);
        renderTile(post);
      }
      setStatus(`Loaded ${postsCache.size} project${postsCache.size === 1 ? "" : "s"}.`, "ok");
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
    const image = meta.image ? new URL(meta.image, base).href : "";
    return {
      slug: entry.slug || meta.title || path,
      title: meta.title || "Untitled build",
      image,
      published: meta.published || "",
      github: meta.github || "",
      content: content.trim(),
      sourcePath: path,
    };
  }

  function renderTile(post) {
    const tile = document.createElement("article");
    tile.className = "tile";
    const cover = post.image ? normalizePath(post.image) : "";
    if (!cover) {
      tile.classList.add("tile--no-img");
    }
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("aria-label", `Open ${post.title}`);

    tile.innerHTML = `
      ${cover ? `<img class="tile__img" src="${cover}" alt="${post.title} cover">` : ""}
      <div class="tile__title">
        <h3>${post.title}</h3>
        <p>${post.published ? post.published : "Markdown-sourced"}</p>
      </div>
    `;

    const activate = () => openPost(post.slug);
    tile.addEventListener("click", activate);
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });

    gridEl.appendChild(tile);
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
    detailPanel.style.setProperty(
      "--hero",
      post.image ? `url('${normalizePath(post.image)}')` : ""
    );
    detailTitle.textContent = post.title;
    detailDate.textContent = post.published || "Captured in-game";
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
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([detailContent]).catch((err) =>
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

    detailContent.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const img = target.closest("img");
      if (img && img.src) {
        openLightbox(img.src, img.alt || img.title || "");
      }
    });
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
