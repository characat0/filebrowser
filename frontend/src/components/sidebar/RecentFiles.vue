<template>
  <div class="recent-files">
    <div class="sidebar-divider-container recent-files-header" role="button" tabindex="0"
      :aria-expanded="!collapsed" @click="toggleCollapsed" @keydown.enter.prevent="toggleCollapsed">
      <span class="sidebar-divider-text">
        <i class="material-symbols recent-files-header__icon">hourglass</i>
        {{ $t("sidebar.recentlyOpened") }}
        <i class="material-symbols recent-files-header__icon">{{ toggleIcon }}</i>
      </span>
    </div>
    <div v-if="!collapsed" class="inner-card">
      <a v-for="file in files" :key="`${file.source}:${file.path}`" :href="fileHref(file)"
        :aria-label="`${$t('sidebar.recentlyOpened')}: ${fileName(file.path)}`" data-testid="recent-file" class="action button sidebar-link-button recent-file"
        :class="{ active: isCurrent(file) }" @click.prevent="open(file)"
        @mouseenter="showTooltip($event, file)" @mouseleave="hideTooltip">
        <div class="link-container">
          <i class="material-symbols link-icon">{{ fileIcon(file.path) }}</i>
          <span class="recent-file__name">{{ fileName(file.path) }}</span>
        </div>
      </a>
      <p v-if="loaded && files.length === 0" class="recent-files-empty">
        {{ $t("sidebar.recentlyOpenedEmpty") }}
      </p>
    </div>
  </div>
</template>

<script>
import { state, getters } from "@/store";
import { recentFiles } from "@/api/tools";
import { buildItemUrl, goToItem } from "@/utils/url";
import { hideInteractiveTooltip, showHoverTooltip } from "@/utils/tooltipHelp.js";

const LIMIT = 10;
const COLLAPSED_KEY = "sidebarRecentFilesCollapsed";

const ICONS_BY_EXTENSION = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg", "tif", "tiff", "avif", "raw"],
  movie: ["mp4", "mkv", "mov", "avi", "webm", "m4v", "wmv"],
  music_note: ["mp3", "flac", "wav", "m4a", "ogg", "aac", "opus"],
  picture_as_pdf: ["pdf"],
  table: ["xls", "xlsx", "ods", "csv"],
  slideshow: ["ppt", "pptx", "odp"],
  docs: ["doc", "docx", "odt", "rtf"],
  markdown: ["md"],
  archive: ["zip", "rar", "7z", "tar", "gz", "tgz", "xz"],
  code: ["js", "ts", "py", "go", "json", "yaml", "yml", "html", "css", "sh", "vue"],
};

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default {
  name: "SidebarRecentFiles",
  data() {
    return {
      files: [],
      loaded: false,
      collapsed: readCollapsed(),
    };
  },
  computed: {
    currentReq: () => state.req,
    toggleIcon() {
      return this.collapsed ? "keyboard_arrow_down" : "keyboard_arrow_up";
    },
  },
  watch: {
    // Opening a file puts it at the top right away; the server copy catches up on the next refresh.
    currentReq(req) {
      if (!req?.source || !req.path || req.type === "directory" || getters.isShare()) {
        return;
      }
      const opened = { source: req.source, path: req.path, openedAt: Math.floor(Date.now() / 1000) };
      this.files = [opened, ...this.files.filter((f) => !this.sameFile(f, opened))].slice(0, LIMIT);
    },
  },
  mounted() {
    if (!this.collapsed) {
      void this.refresh();
    }
  },
  methods: {
    async refresh() {
      try {
        this.files = (await recentFiles(LIMIT)) || [];
      } catch {
        this.files = [];
      } finally {
        this.loaded = true;
      }
    },
    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(this.collapsed));
      } catch {
        // storage unavailable; the choice just isn't remembered
      }
      if (!this.collapsed) {
        void this.refresh();
      }
    },
    sameFile(a, b) {
      return a.source === b.source && a.path === b.path;
    },
    isCurrent(file) {
      return this.sameFile(file, { source: state.req?.source, path: state.req?.path });
    },
    fileName(path) {
      const parts = path.split("/").filter(Boolean);
      return parts[parts.length - 1] || path;
    },
    fileIcon(path) {
      const ext = this.fileName(path).split(".").pop().toLowerCase();
      for (const [icon, exts] of Object.entries(ICONS_BY_EXTENSION)) {
        if (exts.includes(ext)) {
          return icon;
        }
      }
      return "description";
    },
    fileHref(file) {
      return buildItemUrl(file.source, file.path, true);
    },
    open(file) {
      hideInteractiveTooltip();
      goToItem(file.source, file.path, {
        name: state.req?.name,
        source: state.req?.source,
        path: state.req?.path,
      });
    },
    showTooltip(event, file) {
      const when = new Date(file.openedAt * 1000).toLocaleString();
      showHoverTooltip(`${file.source}: ${file.path}\n${when}`, event);
    },
    hideTooltip() {
      hideInteractiveTooltip();
    },
  },
};
</script>

<style scoped>
.recent-files {
  width: 100%;
  margin-top: 0.5em;
}

.recent-files-header {
  cursor: pointer;
  margin-bottom: 0.25em;
  user-select: none;
}

.recent-files-header .sidebar-divider-text {
  gap: 0.25em;
}

.recent-files-header__icon {
  font-size: 1.2em;
}

.recent-file__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-file .link-container {
  min-width: 0;
}

.recent-files-empty {
  font-size: 0.85em;
  color: var(--textSecondary);
  text-align: center;
  margin: 0.5em 0;
}
</style>
