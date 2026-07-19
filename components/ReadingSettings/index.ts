import { Div, Span, View } from 'ranui/builder';
import { EVENT_NAME } from '@/lib/subscribe';
import { fromStore } from '@/lib/reactive';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  LINE_SCALE_MAX,
  LINE_SCALE_MIN,
  LINE_SCALE_STEP,
  getReadingSettings,
  resetReadingSettings,
  updateReadingSettings,
} from '@/store/settings';
import { t } from '@/locales';
import type { ReadingSettings } from '@/store/settings';
import type { ElementBuilder, Getter } from 'ranui/builder';

/** 一行「标签 + 控件」布局。 */
const settingRow = (label: string, control: ElementBuilder): ElementBuilder =>
  Div()
    .class('wr-settings-row')
    .children(Span().class('wr-settings-label').text(label), control);

/**
 * 步进控件（字号 / 行距）：− 值 +，到边界禁用。value 是响应式 getter，
 * dec/inc 直接改设置（夹取在 store 层）。用文本字符（−/+）避免依赖内置图标集。
 */
const stepper = (opts: {
  value: Getter<number>;
  min: number;
  max: number;
  onDec: () => void;
  onInc: () => void;
  format: (v: number) => string;
}): ElementBuilder =>
  Div()
    .class('wr-settings-stepper')
    .children(
      View('button')
        .class(() => `wr-settings-step ${opts.value() <= opts.min ? 'is-disabled' : ''}`)
        .attr('type', 'button')
        .attr('aria-label', 'decrease')
        .text('−')
        .on('click', () => opts.value() > opts.min && opts.onDec()),
      Span().class('wr-settings-value').text(() => opts.format(opts.value())),
      View('button')
        .class(() => `wr-settings-step ${opts.value() >= opts.max ? 'is-disabled' : ''}`)
        .attr('type', 'button')
        .attr('aria-label', 'increase')
        .text('+')
        .on('click', () => opts.value() < opts.max && opts.onInc()),
    );

/**
 * 分段选择器：一排选项，选中项加 is-active。`group` 落到 data-group、每项 key 落到 data-key，
 * 供 CSS 做视觉分化（主题项显色点预览、字体项用各自字体族显示标签）。
 */
const segmented = <T extends string>(opts: {
  value: Getter<T>;
  options: { key: T; label: string }[];
  onSelect: (key: T) => void;
  group?: string;
}): ElementBuilder =>
  Div()
    .class('wr-settings-segmented')
    .attr('data-group', opts.group ?? '')
    .children(
      ...opts.options.map((o) =>
        View('button')
          .class(() => `wr-settings-seg ${opts.value() === o.key ? 'is-active' : ''}`)
          .attr('type', 'button')
          .attr('data-key', o.key)
          .children(Span().class('wr-settings-seg-dot'), Span().class('wr-settings-seg-label').text(o.label))
          .on('click', () => opts.onSelect(o.key)),
      ),
    );

/**
 * 阅读设置面板：字号 / 行距 / 页边距 / 阅读主题 / 正文字体 + 恢复默认。
 * 读写 `store/settings`（localStorage + 响应式），阅读页订阅同一 store 自动重排/换肤。
 * 必须在 `createRoot` 作用域内调用。
 */
export const renderReadingSettings = (): ElementBuilder => {
  const s = fromStore(getReadingSettings, EVENT_NAME.SET_READING_SETTINGS);

  const marginOptions: { key: ReadingSettings['margin']; label: string }[] = [
    { key: 'narrow', label: t('margin_narrow') },
    { key: 'normal', label: t('margin_normal') },
    { key: 'wide', label: t('margin_wide') },
  ];
  const themeOptions: { key: ReadingSettings['theme']; label: string }[] = [
    { key: 'system', label: t('theme_system') },
    { key: 'sepia', label: t('theme_sepia') },
    { key: 'oled', label: t('theme_oled') },
  ];
  const fontOptions: { key: ReadingSettings['font']; label: string }[] = [
    { key: 'serif', label: t('font_serif') },
    { key: 'sans', label: t('font_sans') },
  ];

  return Div()
    .class('wr-settings')
    .children(
      Div().class('wr-settings-title').text(t('reading_settings')),
      settingRow(
        t('font_size'),
        stepper({
          value: () => s().fontScale,
          min: FONT_SCALE_MIN,
          max: FONT_SCALE_MAX,
          onDec: () => updateReadingSettings({ fontScale: s().fontScale - FONT_SCALE_STEP }),
          onInc: () => updateReadingSettings({ fontScale: s().fontScale + FONT_SCALE_STEP }),
          format: (v) => `${Math.round(v * 100)}%`,
        }),
      ),
      settingRow(
        t('line_spacing'),
        stepper({
          value: () => s().lineScale,
          min: LINE_SCALE_MIN,
          max: LINE_SCALE_MAX,
          onDec: () => updateReadingSettings({ lineScale: s().lineScale - LINE_SCALE_STEP }),
          onInc: () => updateReadingSettings({ lineScale: s().lineScale + LINE_SCALE_STEP }),
          format: (v) => `${Math.round(v * 100)}%`,
        }),
      ),
      settingRow(
        t('margin'),
        segmented({
          value: () => s().margin,
          options: marginOptions,
          onSelect: (margin) => updateReadingSettings({ margin }),
          group: 'margin',
        }),
      ),
      settingRow(
        t('reading_theme'),
        segmented({
          value: () => s().theme,
          options: themeOptions,
          onSelect: (theme) => updateReadingSettings({ theme }),
          group: 'theme',
        }),
      ),
      settingRow(
        t('body_font'),
        segmented({
          value: () => s().font,
          options: fontOptions,
          onSelect: (font) => updateReadingSettings({ font }),
          group: 'font',
        }),
      ),
      View('button')
        .class('wr-settings-reset')
        .attr('type', 'button')
        .text(t('reset_settings'))
        .on('click', () => resetReadingSettings()),
    );
};
