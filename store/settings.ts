import { createSignal } from 'ranuts/utils';
import { EVENT_NAME } from '@/lib/subscribe';
import type { Typography } from '@/lib/paging';

/**
 * 阅读设置（字号 / 行距 / 边距 / 阅读主题 / 正文字体）。
 *
 * 存 localStorage（纯偏好，不进 IndexedDB——与书内容/进度解耦，切书不丢、无需异步读取）。
 * 用 ranuts 的 `createSignal` 暴露响应式 getter/setter，阅读页/设置面板经
 * `fromStore(getReadingSettings, EVENT_NAME.SET_READING_SETTINGS)` 共享同一份状态。
 *
 * 关键：`fontScale` / `lineScale` 同时驱动**分页核心**（`pagingTextCore` 重排）与**显示 CSS**
 * （`--wr-font-scale` / `--wr-line-scale`），两侧用同一套倍率保持一致，改设置即重排。
 */
export interface ReadingSettings {
  /** 字号倍率（相对基准 1.16rem），[0.8, 1.6]。 */
  fontScale: number;
  /** 行距倍率（相对基准行高比），[0.75, 1.4]。 */
  lineScale: number;
  /** 页边距档位：窄 / 标准 / 宽（驱动 `--wr-margin-scale`）。 */
  margin: 'narrow' | 'normal' | 'wide';
  /** 阅读主题：跟随应用（亮/暗）/ 护眼米黄 / 纯黑 OLED。 */
  theme: 'system' | 'sepia' | 'oled';
  /** 正文字体：衬线 / 无衬线。 */
  font: 'serif' | 'sans';
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontScale: 1,
  lineScale: 1,
  margin: 'normal',
  theme: 'system',
  font: 'serif',
};

/** 字号倍率可选档（步进按钮夹取用）。 */
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.1;

/** 行距倍率可选档。 */
export const LINE_SCALE_MIN = 0.75;
export const LINE_SCALE_MAX = 1.4;
export const LINE_SCALE_STEP = 0.125;

const STORAGE_KEY = 'weread:reading-settings';

/** 夹取到有效区间并四舍五入到 3 位小数（避免浮点毛刺）。 */
const clampScale = (v: number, min: number, max: number): number =>
  Math.round(Math.max(min, Math.min(max, v)) * 1000) / 1000;

/** 读持久化设置，缺字段/损坏回落默认值（localStorage 不可用时静默用默认）。 */
const loadSettings = (): ReadingSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_READING_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ReadingSettings>;
    return {
      fontScale: clampScale(parsed.fontScale ?? 1, FONT_SCALE_MIN, FONT_SCALE_MAX),
      lineScale: clampScale(parsed.lineScale ?? 1, LINE_SCALE_MIN, LINE_SCALE_MAX),
      margin: parsed.margin === 'narrow' || parsed.margin === 'wide' ? parsed.margin : 'normal',
      theme: parsed.theme === 'sepia' || parsed.theme === 'oled' ? parsed.theme : 'system',
      font: parsed.font === 'sans' ? 'sans' : 'serif',
    };
  } catch {
    return { ...DEFAULT_READING_SETTINGS };
  }
};

const [getReadingSettings, setReadingSettingsRaw] = createSignal<ReadingSettings>(loadSettings(), {
  subscriber: EVENT_NAME.SET_READING_SETTINGS,
});

export { getReadingSettings };

/** 合并局部改动 → 夹取 → 持久化 → 广播（阅读页/面板自动响应）。 */
export const updateReadingSettings = (patch: Partial<ReadingSettings>): void => {
  const next: ReadingSettings = { ...getReadingSettings(), ...patch };
  next.fontScale = clampScale(next.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX);
  next.lineScale = clampScale(next.lineScale, LINE_SCALE_MIN, LINE_SCALE_MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 忽略：持久化失败只影响下次开书，不影响本次阅读
  }
  setReadingSettingsRaw(next);
};

/** 恢复默认设置。 */
export const resetReadingSettings = (): void => updateReadingSettings({ ...DEFAULT_READING_SETTINGS });

// ── 设置 → 排版/CSS 映射（纯函数，供阅读页落到分页核心与 DOM）────────────────

/** 页边距档位 → `--wr-margin-scale` 倍率（与 CSS 内边距 calc 相乘）。 */
export const MARGIN_SCALE: Record<ReadingSettings['margin'], number> = {
  narrow: 0.5,
  normal: 1,
  wide: 1.6,
};

/** 取分页核心需要的排版倍率（字号 / 行距）。 */
export const settingsToTypography = (s: ReadingSettings): Typography => ({
  fontScale: s.fontScale,
  lineScale: s.lineScale,
});

/** 阅读页根元素要设置的 CSS 变量（字号/行距/边距/字体族倍率与栈）。 */
export const settingsToCssVars = (s: ReadingSettings): Record<string, string> => ({
  '--wr-font-scale': String(s.fontScale),
  '--wr-line-scale': String(s.lineScale),
  '--wr-margin-scale': String(MARGIN_SCALE[s.margin]),
  '--wr-body-font': s.font === 'sans' ? 'var(--wr-sans)' : 'var(--wr-serif)',
});

/** 阅读主题对应的根元素 class（'system' 不加类，跟随应用亮/暗）。 */
export const themeClass = (s: ReadingSettings): string =>
  s.theme === 'sepia' ? 'wr-theme-sepia' : s.theme === 'oled' ? 'wr-theme-oled' : '';
