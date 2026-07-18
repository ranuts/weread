/**
 * 书籍语言检测——用于选择对应的语言专属模型（见 docs/chapter-model-deployment.md 2.3）。
 * 只需区分中文 / 英文 / 其他，靠字符占比即可，无需额外模型。
 */

export type BookLang = 'zh' | 'en' | 'other';

/** 已训练/部署的语言专属模型；其余语言走多语言兜底或纯规则 */
export const MODEL_BY_LANG: Partial<Record<BookLang, string>> = {
  zh: 'chapter-title-zh', // chinese-roberta-wwm-ext int8 103MB
  en: 'chapter-title-en', // distilbert-base-uncased int8 67MB
};

/**
 * 按 CJK / 拉丁字符占比判定主语言。取前若干字符采样即可，不必扫全文。
 */
export const detectLanguage = (text: string, sampleSize = 20000): BookLang => {
  const sample = text.slice(0, sampleSize);
  let cjk = 0;
  let latin = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0) ?? 0;
    // CJK 统一表意文字（含扩展 A 常用区）
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) {
      cjk++;
    } else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      latin++;
    }
  }
  if (cjk === 0 && latin === 0) {
    return 'other';
  }
  if (cjk >= latin) {
    return 'zh';
  }
  // 拉丁明显占多才判英文；夹杂少量 CJK 的仍归中文
  return latin > cjk * 3 ? 'en' : 'zh';
};

/** 该语言是否有已部署的专属模型 */
export const modelIdForLang = (lang: BookLang): string | undefined => MODEL_BY_LANG[lang];
