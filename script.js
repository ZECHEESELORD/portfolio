(() => {
  const EMBEDDED_POSTS = [
    {
      slug: "skyforge",
      file: "skyforge.md",
      text: `---
title: Skyforge Render Engine
image: ../assets/skyforge-cover.svg
published: 2024-11-18
---

## Challenge
Build a performant rendering pipeline for a multiplayer Minecraft realm that could replay world events smoothly while capturing cinematic fly-throughs.

## Approach
- Prototyped a chunk-streaming layer that reads region files ahead of the camera path.
- Batched block updates into mesh layers (solid, translucent, emissive) to keep the GPU state predictable.
- Added a lightweight scripting API for camera rails so creators can choreograph shots without touching code.

## Highlights
1. 120+ FPS in crowded hubs with animated armor stands and particle-heavy scenes.
2. Deterministic replays: camera rails and events are serialized so shots remain frame-accurate between edits.
3. Diegetic HUD: block-style lower thirds and timeline overlays that match the Minecraft aesthetic.

## Tech Stack
- Kotlin + Fabric for ingestion hooks
- Rust worker for mesh baking
- GLSL for the custom lighting pass
- Python notebooks for profiling and telemetry reviews

## What I'd Improve Next
Add a real-time GI probe for interiors and ship a web viewer so clients can scrub camera rails in-browser.
`,
    },
  ];

  const gridEl = document.querySelector("#projectGrid");
  const detailOverlay = document.querySelector("#detailOverlay");
  const detailPanel = document.querySelector("#detailOverlay .overlay__panel");
  const detailContent = document.querySelector("#detailContent");
  const detailTitle = document.querySelector("#detailTitle");
  const detailDate = document.querySelector("#detailDate");
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
      setStatus(
        "file:// blocks fetch. Showing embedded sample - run a local server for your own posts.",
        "warn"
      );
      loadEmbeddedPosts();
      return;
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
      setStatus("Failed to load posts. Check console and paths. Falling back to sample.", "error");
      loadEmbeddedPosts();
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

  function loadEmbeddedPosts() {
    EMBEDDED_POSTS.forEach((entry) => {
      const path = entry.file ? `posts/${entry.file}` : "posts/embedded.md";
      const post = buildPost(entry, entry.text, path);
      postsCache.set(post.slug, post);
      renderTile(post);
    });
    setStatus(`Loaded ${postsCache.size} sample project${postsCache.size === 1 ? "" : "s"}.`, "ok");
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

    if (window.marked) {
      detailContent.innerHTML = window.marked.parse(post.content || "");
    } else {
      detailContent.textContent = post.content || "";
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
