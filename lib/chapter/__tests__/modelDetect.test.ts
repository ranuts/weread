import { describe, expect, it, vi } from 'vitest';
import { detectChaptersWithModel } from '../modelDetect';

const filler = (chars: number): string => {
  const sentence = '段誉在无量剑湖畔遇到了神农帮的众人，一场恶斗即将展开，局势凶险万分。';
  let out = '';
  while (out.length < chars) {
    out += sentence + '\n';
  }
  return out;
};

/** 模拟分类器：makeModelInput 里 text 段短且不像正文的判为标题 */
const fakeClassify = (titleTexts: Set<string>) => {
  return vi.fn(async (inputs: string[]) => {
    return inputs.map((input) => {
      // makeModelInput 格式：feats [SEP] prev [SEP] text [SEP] next
      const parts = input.split(' [SEP] ');
      const text = parts[2] ?? '';
      return titleTexts.has(text) ? 0.95 : 0.02;
    });
  });
};

describe('detectChaptersWithModel', () => {
  it('模型接住规则漏掉的空格分隔回目（金庸式）', async () => {
    const titles = ['一 青衫磊落险峰行', '二 玉壁月华明', '三 马疾香幽', '四 崖高人远'];
    const text = titles.map((t) => `${t}\n${filler(500)}`).join('\n');
    const classify = fakeClassify(new Set(titles));

    const chapters = await detectChaptersWithModel(text, classify, { threshold: 0.5 });
    expect(chapters.map((c) => c.title)).toEqual(titles);
    // 只对短的标题候选行调用模型，不对每一行
    const classifiedCount = classify.mock.calls[0][0].length;
    expect(classifiedCount).toBeLessThan(text.split('\n').filter(Boolean).length);
  });

  it('预过滤：以句末标点结尾的正文行不送模型', async () => {
    const text = ['第一章 起点', filler(300), '第二章 结局', filler(300)].join('\n');
    const classify = fakeClassify(new Set(['第一章 起点', '第二章 结局']));
    await detectChaptersWithModel(text, classify, { threshold: 0.5 });
    const sentToModel: string[] = classify.mock.calls[0][0].map((input: string) => input.split(' [SEP] ')[2]);
    // 填充正文以「。」结尾，不应出现在送模型的候选里
    expect(sentToModel.some((t) => t.endsWith('。'))).toBe(false);
  });

  it('边界成链，end 指向下一章起点', async () => {
    const titles = ['一 起点', '二 转折', '三 结局'];
    const text = titles.map((t) => `${t}\n${filler(500)}`).join('\n');
    const chapters = await detectChaptersWithModel(text, fakeClassify(new Set(titles)), { threshold: 0.5 });
    expect(chapters).toHaveLength(3);
    expect(chapters[0].end).toBe(chapters[1].start);
    expect(chapters[2].end).toBe(text.length);
  });
});
