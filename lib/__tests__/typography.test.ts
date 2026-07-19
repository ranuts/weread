import { describe, expect, it } from 'vitest';
import { DEFAULT_TYPOGRAPHY, pagingTextCore } from '@/lib/paging';
import { MARGIN_SCALE, settingsToCssVars, settingsToTypography } from '@/store/settings';
import type { ReadingSettings } from '@/store/settings';

/** 一段足够长的中文正文，保证会分成多页。 */
const longText = (() => {
  const line = '春天的风从山谷里吹过来，带着潮湿的泥土气息，她沿着旧铁轨慢慢往前走看着远方。';
  let out = '';
  while (out.length < 20000) out += line + '\n';
  return out;
})();

const DIMS = { clientWidth: 600, clientHeight: 800 };

describe('pagingTextCore 排版倍率', () => {
  it('fontScale=1/lineScale=1 与不传 typography 逐位相同（零回归）', () => {
    const base = pagingTextCore(longText, DIMS);
    const explicit = pagingTextCore(longText, DIMS, { fontScale: 1, lineScale: 1 });
    expect(explicit.program.length).toBe(base.program.length);
    expect(explicit.fontSize).toBe(base.fontSize);
    expect(explicit.lineHeight).toBe(base.lineHeight);
    expect(explicit.charsPerLine).toBe(base.charsPerLine);
    // 每页边界完全一致
    expect(explicit.program.map((p) => p.end)).toEqual(base.program.map((p) => p.end));
  });

  it('默认常量与原始硬编码一致（fontSize 18 / lineHeight 40）', () => {
    const base = pagingTextCore(longText, DIMS, DEFAULT_TYPOGRAPHY);
    expect(base.fontSize).toBeCloseTo(18, 5);
    expect(base.lineHeight).toBeCloseTo(40, 5);
  });

  it('放大字号 → 每页字符更少、页数更多', () => {
    const base = pagingTextCore(longText, DIMS, { fontScale: 1, lineScale: 1 });
    const big = pagingTextCore(longText, DIMS, { fontScale: 1.5, lineScale: 1 });
    expect(big.pageTotalChar).toBeLessThan(base.pageTotalChar);
    expect(big.program.length).toBeGreaterThan(base.program.length);
  });

  it('增大行距 → 每页行数更少、页数更多（字号不变）', () => {
    const base = pagingTextCore(longText, DIMS, { fontScale: 1, lineScale: 1 });
    const loose = pagingTextCore(longText, DIMS, { fontScale: 1, lineScale: 1.4 });
    expect(loose.fontSize).toBe(base.fontSize); // 字号不受行距影响
    expect(loose.totalLine).toBeLessThan(base.totalLine);
    expect(loose.program.length).toBeGreaterThan(base.program.length);
  });

  it('分页覆盖全文，无字符丢失（放大字号后仍完整）', () => {
    const big = pagingTextCore(longText, DIMS, { fontScale: 1.4, lineScale: 1.2 });
    const covered = big.program.reduce((sum, p) => sum + (p.end - p.start), 0);
    expect(covered).toBe(big.total);
  });
});

describe('阅读设置 → 排版/CSS 映射', () => {
  const settings: ReadingSettings = {
    fontScale: 1.2,
    lineScale: 0.875,
    margin: 'wide',
    theme: 'sepia',
    font: 'sans',
  };

  it('settingsToTypography 抽取字号/行距倍率', () => {
    expect(settingsToTypography(settings)).toEqual({ fontScale: 1.2, lineScale: 0.875 });
  });

  it('settingsToCssVars 产出与分页核心一致的倍率变量', () => {
    const vars = settingsToCssVars(settings);
    expect(vars['--wr-font-scale']).toBe('1.2');
    expect(vars['--wr-line-scale']).toBe('0.875');
    expect(vars['--wr-margin-scale']).toBe(String(MARGIN_SCALE.wide));
    expect(vars['--wr-body-font']).toBe('var(--wr-sans)');
  });

  it('衬线字体映射到 --wr-serif', () => {
    expect(settingsToCssVars({ ...settings, font: 'serif' })['--wr-body-font']).toBe('var(--wr-serif)');
  });

  it('页边距档位倍率单调递增（窄<标准<宽）', () => {
    expect(MARGIN_SCALE.narrow).toBeLessThan(MARGIN_SCALE.normal);
    expect(MARGIN_SCALE.normal).toBeLessThan(MARGIN_SCALE.wide);
  });
});
