/* SirKayZh 个人主页 — 首页卡片 + 项目详情页渲染
 * 数据源：data/projects.json（手写元信息）+ data/releases.json（GitHub Release 自动同步）
 */
(function () {
  "use strict";

  var REL_PATH = document.body.dataset.rel || ""; // 详情页在 /projects/ 下需回退一级

  /* ---------- utils ---------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0, n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + " " + units[i];
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* 极简 Markdown → HTML（用于 Release Notes），先 esc 再白名单重建 */
  function mdToHtml(md) {
    if (!md) return "<p class='dl-hint'>该版本暂无更新说明。</p>";
    var lines = esc(md).split(/\r?\n/);
    var out = [], inList = false, inCode = false;
    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
    function inline(t) {
      return t
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^```/.test(line)) {
        closeList(); out.push(inCode ? "</pre>" : "<pre>");
        inCode = !inCode;
        continue;
      }
      if (inCode) { out.push(line); continue; }
      if (/^#{1,3}\s/.test(line)) {
        closeList();
        var level = line.match(/^#+/)[0].length;
        out.push("<h" + (level + 1) + ">" + inline(line.replace(/^#+\s*/, "")) + "</h" + (level + 1) + ">");
      } else if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
      } else if (/^---+$/.test(line.trim())) {
        closeList(); out.push("<hr>");
      } else if (line.trim() === "") {
        closeList();
      } else {
        closeList(); out.push("<p>" + inline(line) + "</p>");
      }
    }
    closeList();
    if (inCode) out.push("</pre>");
    return out.join("\n");
  }

  /* ---------- platform detect ---------- */

  /* Apple Silicon 探测：Mac 上所有浏览器 UA 都伪装成 Intel（"Intel Mac OS X 10_15_7"），
   * 只能靠 WebGL 渲染器旁证 —— Apple Silicon 的 GPU 渲染器串必含 "Apple"。 */
  function isAppleSilicon() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return false;
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      var r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      return /Apple/i.test(r);
    } catch (e) { return false; }
  }

  function detectPlatform() {
    var ua = navigator.userAgent;
    var mac = /Macintosh|Mac OS X/i.test(ua);
    var win = /Windows/i.test(ua);
    if (win) return "windows-x64";
    if (mac) return isAppleSilicon() ? "macos-arm64" : "macos-x64";
    return "unknown";
  }

  var PLATFORM_LABEL = {
    "macos-arm64": "macOS (Apple Silicon)",
    "macos-x64": "macOS (Intel)",
    "windows-x64": "Windows x64",
    "unknown": "当前系统"
  };

  /* 首页按钮用短文案，避免卡片内换行 */
  var PLATFORM_SHORT = {
    "macos-arm64": "macOS",
    "macos-x64": "macOS",
    "windows-x64": "Windows",
    "unknown": "安装包"
  };

  /* ---------- download matching ---------- */

  function pickAssets(project, release, platformKey) {
    if (!release || !release.assets || !release.assets.length || !project.downloads) return null;
    var rule = project.downloads[platformKey];
    var list = release.assets.slice();
    if (!rule) {
      // 该平台无专属规则（如 Linux 访客）→ 展示全部
      return { primary: null, all: list };
    }
    var primary = null;
    for (var i = 0; i < rule.prefer.length && !primary; i++) {
      for (var j = 0; j < list.length; j++) {
        if (list[j].name.toLowerCase().indexOf(rule.prefer[i].toLowerCase()) !== -1) { primary = list[j]; break; }
      }
    }
    if (!primary) {
      for (var k = 0; k < rule.any.length && !primary; k++) {
        for (var j2 = 0; j2 < list.length; j2++) {
          if (list[j2].name.toLowerCase().indexOf(rule.any[k].toLowerCase()) !== -1) { primary = list[j2]; break; }
        }
      }
    }
    return { primary: primary, all: list };
  }

  function totalDownloads(release) {
    if (!release || !release.assets) return 0;
    return release.assets.reduce(function (s, a) { return s + (a.download_count || 0); }, 0);
  }

  /* ---------- home page ---------- */

  function renderHome(projects, releasesMap) {
    var root = document.getElementById("projects");
    var platformKey = detectPlatform();
    var hint = document.getElementById("os-hint");
    if (hint && platformKey !== "unknown") hint.textContent = "（" + PLATFORM_LABEL[platformKey] + "）";

    var html = projects.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); }).map(function (p) {
      var rel = releasesMap[p.slug] || null;
      var hasDownload = rel && rel.assets && rel.assets.length > 0;
      var matched = pickAssets(p, rel, platformKey);
      var primary = matched && matched.primary;

      var chips = (p.platforms || []).map(function (pl) {
        return '<span class="chip platform">' + esc(pl) + "</span>";
      }).join("");
      chips += rel
        ? '<span class="chip version">' + esc(rel.tag) + " · " + fmtDate(rel.published_at) + "</span>"
        : '<span class="chip soon">即将开源</span>';

      var actions;
      if (hasDownload && primary) {
        actions =
          '<a class="btn btn-primary" href="' + esc(primary.url) + '"><span class="dl-icon">⬇</span>下载 ' +
          esc(p.platforms.length > 1 ? PLATFORM_SHORT[platformKey] : "安装包") + "</a>";
      } else if (hasDownload && !primary) {
        actions = '<a class="btn btn-primary" href="' + esc(rel.html_url) + '"><span class="dl-icon">⬇</span>前往下载</a>';
      } else {
        actions = '<span class="btn disabled">暂未开放下载</span>';
      }
      actions += '<a class="btn btn-ghost" href="projects/' + esc(p.slug) + '.html">详情 →</a>';

      var dl = hasDownload ? totalDownloads(rel) : 0;

      return (
        '<article class="card">' +
        '<div class="card-top">' +
        '<div class="card-icon"><img src="' + REL_PATH + esc(p.icon) + '" alt="' + esc(p.name) + '"></div>' +
        '<div class="card-title-group">' +
        '<a class="card-title" href="projects/' + esc(p.slug) + '.html">' + esc(p.name) + "</a>" +
        '<div class="card-tagline">' + esc(p.tagline) + "</div>" +
        "</div></div>" +
        '<p class="card-desc">' + esc(p.description) + "</p>" +
        '<div class="card-meta">' + chips + (dl ? '<span class="chip">⬇ ' + dl + " 次下载</span>" : "") + "</div>" +
        '<div class="card-actions">' + actions + "</div>" +
        "</article>"
      );
    }).join("");
    root.innerHTML = html;
  }

  /* ---------- detail page ---------- */

  function renderDetail(slug, projects, releasesMap) {
    var root = document.getElementById("project-root");
    var p = projects.filter(function (x) { return x.slug === slug; })[0];
    if (!p) { root.innerHTML = '<p class="error-box">项目不存在 <a href="../">返回首页</a></p>'; return; }
    var rel = releasesMap[p.slug] || null;
    var platformKey = detectPlatform();
    var matched = pickAssets(p, rel, platformKey);
    var primary = matched && matched.primary;
    var hasDownload = rel && rel.assets && rel.assets.length > 0;

    document.title = p.name + " · SirKayZh";

    var html = "";

    /* header */
    html +=
      '<div class="proj-head">' +
      '<div class="proj-head-row">' +
      '<div class="proj-icon"><img src="../' + esc(p.icon) + '" alt="' + esc(p.name) + '"></div>' +
      "<div><h1 class=\"proj-name\">" + esc(p.name) + "</h1>" +
      '<div class="proj-tagline">' + esc(p.tagline) + "</div>" +
      '<div class="proj-chips">' +
      (p.platforms || []).map(function (pl) { return '<span class="chip platform">' + esc(pl) + "</span>"; }).join("") +
      (rel ? '<span class="chip version">' + esc(rel.tag) + "</span>" : '<span class="chip soon">即将开源</span>') +
      "</div></div></div>" +
      '<p class="proj-desc">' + esc(p.description) + "</p>" +
      "</div>";

    /* download */
    html += '<section class="proj-section" id="download"><h2>下载</h2><div class="dl-panel">';
    if (hasDownload) {
      if (primary) {
        html +=
          '<div class="dl-primary-row">' +
          '<a class="btn btn-primary" href="' + esc(primary.url) + '"><span class="dl-icon">⬇</span>下载 ' +
          esc(PLATFORM_LABEL[platformKey]) + " 版</a>" +
          '<span class="dl-hint">' + esc(primary.name) + " · " + fmtSize(primary.size) +
          " · 已自动匹配你的系统</span>" +
          "</div>";
      } else {
        html += '<div class="dl-primary-row"><a class="btn btn-primary" href="' + esc(rel.html_url) +
          '"><span class="dl-icon">⬇</span>前往 GitHub Release 下载</a>' +
          '<span class="dl-hint">未识别到你的系统，全部版本见下表</span></div>';
      }
      var installKey = platformKey.indexOf("macos") === 0 ? "macos" : platformKey.indexOf("windows") === 0 ? "windows" : null;
      if (installKey && p.install && p.install[installKey]) {
        html += '<div class="note">' + esc(p.install[installKey]).replace(/xattr -cr [^\s]+/, function (m) { return "<code>" + m + "</code>"; }) + "</div>";
      }
      html +=
        '<table class="dl-table"><thead><tr><th>文件</th><th>大小</th><th>下载</th></tr></thead><tbody>' +
        rel.assets.map(function (a) {
          return "<tr><td>" + esc(a.name) + "</td><td class=\"size\">" + fmtSize(a.size) +
            '</td><td><a href="' + esc(a.url) + '">下载</a></td></tr>';
        }).join("") +
        "</tbody></table>";
    } else {
      html += '<div class="note">该项目正在整理开源发布，安装包即将上架 <a href="https://github.com/' +
        esc(p.repo) + '" target="_blank" rel="noopener">GitHub Release</a>，敬请期待。</div>';
    }
    html += "</div></section>";

    /* features */
    if (p.highlights && p.highlights.length) {
      html += '<section class="proj-section"><h2>功能亮点</h2><ul class="feature-list">' +
        p.highlights.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul></section>";
    }

    /* screenshots */
    if (p.screenshots && p.screenshots.length) {
      html += '<section class="proj-section"><h2>截图</h2><div class="shots">' +
        p.screenshots.map(function (s) {
          return '<figure class="shot"><img src="../' + esc(s.src) + '" alt="' + esc(s.caption) +
            '" loading="lazy"><figcaption>' + esc(s.caption) + "</figcaption></figure>";
        }).join("") + "</div></section>";
    }

    /* release notes */
    if (rel) {
      html += '<section class="proj-section"><h2>更新日志 · ' + esc(rel.tag) +
        '<span class="dl-hint" style="margin-left:12px">' + fmtDate(rel.published_at) + "</span></h2>" +
        '<div class="release-notes">' + mdToHtml(rel.notes_md) + "</div>" +
        '<p style="margin-top:14px"><a href="' + esc(rel.html_url) + '" target="_blank" rel="noopener">在 GitHub 查看全部历史版本 →</a></p></section>';
    }

    /* faq */
    if (p.faq && p.faq.length) {
      html += '<section class="proj-section"><h2>常见问题</h2><div class="faq-list">' +
        p.faq.map(function (f) { return '<div class="faq"><h3>' + esc(f.q) + "</h3><p>" + esc(f.a) + "</p></div>"; }).join("") +
        "</div></section>";
    }

    /* repo */
    html += '<p class="back-link">🔗 源代码与提反馈：<a href="https://github.com/' + esc(p.repo) +
      '" target="_blank" rel="noopener">github.com/' + esc(p.repo) + "</a>　·　<a href=\"../\">← 返回首页</a></p>";

    root.innerHTML = html;
  }

  /* ---------- boot ---------- */

  function boot() {
    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    var page = document.body.dataset.page;
    var base = page === "detail" ? "../" : "";

    Promise.all([
      fetch(base + "data/projects.json").then(function (r) { return r.json(); }),
      fetch(base + "data/releases.json").then(function (r) { return r.json(); })
    ]).then(function (results) {
      var projects = results[0].projects;
      var releasesMap = (results[1] && results[1].releases) || {};
      if (page === "home") {
        renderHome(projects, releasesMap);
      } else if (page === "detail") {
        var slug = document.getElementById("project-root").dataset.slug;
        renderDetail(slug, projects, releasesMap);
      }
    }).catch(function (err) {
      console.error(err);
      var el = document.getElementById("projects") || document.getElementById("project-root");
      if (el) el.innerHTML = '<p class="error-box">数据加载失败，请刷新重试</p>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
