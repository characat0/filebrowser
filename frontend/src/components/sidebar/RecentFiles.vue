<template>
  <div class="recent-files" data-testid="sidebar-recent-files">
    <button type="button" class="recent-files__header action" :aria-expanded="String(!collapsed)"
      @click="toggleCollapsed">
      <i :class="`${getIconClass(headerIcon)} link-icon`">{{ headerIcon }}</i>
      <span class="recent-files__title">{{ title }}</span>
      <i class="material-symbols recent-files__chevron" :class="{ 'recent-files__chevron--collapsed': collapsed }">keyboard_arrow_down</i>
    </button>

    <div v-if="!collapsed" class="recent-files__body">
      <template v-for="group in groups" :key="group.key">
        <div class="recent-files__group">{{ group.label }}</div>
        <a v-for="file in group.files" :key="`${file.source}:${file.path}`" :href="fileHref(file)"
          :target="options.newTab ? '_blank' : null" :rel="options.newTab ? 'noopener' : null"
          :aria-label="`${title}: ${file.name}`" data-testid="recent-file"
          class="recent-file" :class="{ 'recent-file--current': isCurrent(file) }"
          @click="onClick($event, file)" @mouseenter="showTooltip($event, file)" @mouseleave="hideTooltip">
          <Icon class="recent-file__icon" :mimetype="file.type || ''" :filename="file.name" />
          <span class="recent-file__text">
            <span class="recent-file__name">{{ file.name }}</span>
            <span class="recent-file__folder">{{ folderLabel(file) }}</span>
          </span>
          <span class="recent-file__time">{{ timeLabel(file) }}</span>
        </a>
      </template>
      <p v-if="loaded && files.length === 0" class="recent-files__empty">
        {{ $t("sidebar.recentlyOpenedEmpty") }}
      </p>
    </div>
  </div>
</template>

<script>
import Icon from "@/components/files/Icon.vue";
import { recentFiles } from "@/api/tools";
import { toStandardLocale } from "@/i18n/index.ts";
import { getters, state } from "@/store";
import { getIconClass } from "@/utils/material-symbols";
import {
  formatOpenedTime,
  groupRecentFiles,
  parentFolder,
  parseRecentTarget,
  RECENT_DEFAULT_ICON,
} from "@/utils/recentFiles.js";
import { hideInteractiveTooltip, showHoverTooltip } from "@/utils/tooltipHelp.js";
import { buildItemUrl, goToItem } from "@/utils/url";

const COLLAPSED_KEY_PREFIX = "sidebarRecentFilesCollapsed:";
const REFRESH_MIN_INTERVAL_MS = 5000;

export default {
  name: "SidebarRecentFiles",
  components: { Icon },
  props: {
    link: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      files: [],
      loaded: false,
      collapsed: false,
      lastRefresh: 0,
      now: new Date(),
    };
  },
  computed: {
    options() {
      return parseRecentTarget(this.link.target);
    },
    title() {
      return this.link.name || this.$t("sidebar.recentlyOpened");
    },
    headerIcon() {
      return this.link.icon || RECENT_DEFAULT_ICON;
    },
    locale() {
      return toStandardLocale(state.user?.locale || "en");
    },
    groups() {
      return groupRecentFiles(this.files, this.locale, this.now);
    },
    showSourceName() {
      return Object.keys(state.sources?.info || {}).length > 1;
    },
    collapsedKey() {
      return `${COLLAPSED_KEY_PREFIX}${this.link.name || "recent"}`;
    },
    currentReq: () => state.req,
  },
  watch: {
    // A file opened in this tab goes to the top right away; the server list catches up on the next refresh.
    currentReq(req) {
      if (!req?.source || !req.path || req.type === "directory" || getters.isShare()) {
        return;
      }
      this.promote({
        source: req.source,
        path: req.path,
        name: req.name,
        type: req.type,
        openedAt: Math.floor(Date.now() / 1000),
      });
    },
    "options.limit"() {
      void this.refresh(true);
    },
  },
  mounted() {
    try {
      this.collapsed = localStorage.getItem(this.collapsedKey) === "true";
    } catch {
      this.collapsed = false;
    }
    if (!this.collapsed) {
      void this.refresh(true);
    }
    // Files opened in other tabs show up when you come back to this one.
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  },
  beforeUnmount() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  },
  methods: {
    getIconClass,
    async refresh(force = false) {
      if (!force && Date.now() - this.lastRefresh < REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      this.lastRefresh = Date.now();
      try {
        this.files = (await recentFiles(this.options.limit)) || [];
      } catch {
        // keep whatever is shown; the next refresh retries
      } finally {
        this.now = new Date();
        this.loaded = true;
      }
    },
    onVisibilityChange() {
      if (document.visibilityState === "visible" && !this.collapsed) {
        void this.refresh();
      }
    },
    promote(file) {
      const rest = this.files.filter((f) => !(f.source === file.source && f.path === file.path));
      this.files = [file, ...rest].slice(0, this.options.limit);
      this.now = new Date();
    },
    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      try {
        localStorage.setItem(this.collapsedKey, String(this.collapsed));
      } catch {
        // storage unavailable; the choice just isn't remembered
      }
      if (!this.collapsed) {
        void this.refresh(true);
      }
    },
    isCurrent(file) {
      return file.source === state.req?.source && file.path === state.req?.path;
    },
    fileHref(file) {
      return buildItemUrl(file.source, file.path, true);
    },
    folderLabel(file) {
      const folder = parentFolder(file.path) || "/";
      return this.showSourceName ? `${file.source} · ${folder}` : folder;
    },
    timeLabel(file) {
      return formatOpenedTime(file.openedAt, this.locale, this.now);
    },
    onClick(event, file) {
      hideInteractiveTooltip();
      // New-tab links and modified/middle clicks are left to the browser.
      if (this.options.newTab || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        this.promote({ ...file, openedAt: Math.floor(Date.now() / 1000) });
        return;
      }
      event.preventDefault();
      goToItem(file.source, file.path, {
        name: state.req?.name,
        source: state.req?.source,
        path: state.req?.path,
      });
    },
    showTooltip(event, file) {
      const opened = new Date(file.openedAt * 1000).toLocaleString(this.locale);
      showHoverTooltip(`${file.source}: ${file.path}\n${opened}`, event);
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
  max-width: 98%;
  margin-top: 0.25em;
}

.recent-files__header {
  display: flex;
  align-items: center;
  gap: 0.5em;
  width: 100%;
  min-height: 2.75em;
  padding: 0 0.5em;
  border-radius: 0.5em;
  color: var(--textPrimary);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.recent-files__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-files__chevron {
  color: var(--textSecondary);
  transition: transform 0.15s ease;
}

.recent-files__chevron--collapsed {
  transform: rotate(-90deg);
}

.recent-files__body {
  display: flex;
  flex-direction: column;
  padding-left: 0.5em;
}

.recent-files__group {
  font-size: 0.75em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--textSecondary);
  padding: 0.6em 0.5em 0.2em;
}

.recent-file {
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.3em 0.5em;
  border-radius: 0.5em;
  color: var(--textPrimary);
  text-decoration: none;
  cursor: pointer;
}

.recent-file:hover {
  background: var(--surfaceSecondary);
}

.recent-file--current {
  background: var(--alt-background);
}

.recent-file__icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75em;
  height: 1.75em;
}

.recent-file__icon :deep(i) {
  font-size: 1.5em;
}

.recent-file__text {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.25;
}

.recent-file__name,
.recent-file__folder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-file__name {
  font-size: 0.9em;
}

.recent-file__folder {
  font-size: 0.75em;
  color: var(--textSecondary);
}

.recent-file__time {
  flex: 0 0 auto;
  font-size: 0.75em;
  color: var(--textSecondary);
  font-variant-numeric: tabular-nums;
}

.recent-files__empty {
  font-size: 0.85em;
  color: var(--textSecondary);
  margin: 0.5em;
}
</style>
