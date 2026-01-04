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
      for (const entry of index) {
        await loadPost(entry);
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
    if (!path) return;
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Unable to fetch ${path} (${res.status})`);
    const text = await res.text();
    const post = buildPost(entry, text, path);
    postsCache.set(post.slug, post);
    renderTile(post);
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
    tile.style.setProperty("--cover", post.image ? `url('${normalizePath(post.image)}')` : "");
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("aria-label", `Open ${post.title}`);

    tile.innerHTML = `
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
    document.body.classList.add("overlay-open");
    detailContent.scrollTop = 0;
  }

  function closeDetail(scrollToGrid) {
    if (!detailOverlay) return;
    detailOverlay.hidden = true;
    detailContent.innerHTML = "";
    document.body.classList.remove("overlay-open");
    if (scrollToGrid) {
      gridEl.scrollIntoView({ behavior: "smooth", block: "start" });
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

  boot();
})();
