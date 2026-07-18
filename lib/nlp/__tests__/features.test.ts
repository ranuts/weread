import { describe, expect, it } from 'vitest';
import { featTokens, makeModelInput } from '../features';

/**
 * 参照输出由训练侧 ml/textfeat.py 生成（feat_tokens）。
 * 这些断言锁死 JS 与 Python 的一致性——任何一侧改了特征逻辑，这里必须同步且相等。
 */
describe('featTokens 与 ml/textfeat.py 一致', () => {
  const cases: Array<[{ prev: string; text: string; next: string; pos: number }, string]> = [
    [{ prev: '上一段结尾。', text: '第一章 风雪夜', next: '那是一个很冷的夜晚，风雪交加，她独自走在山路上。', pos: 0.1 }, 'L1 P0 Q0 NX1 PV0'],
    [
      { prev: '他说了些什么。', text: '这个道理其实很简单，只要用心去想就能明白。', next: '于是他继续说道。', pos: 0.5 },
      'L2 P1 Q2 NX0 PV0',
    ],
    [{ prev: '', text: '累到无力抵抗', next: '当我们的自控力像肌肉一样疲劳时就很难坚持。', pos: 0.3 }, 'L0 P0 Q1 NX1 PV0'],
    [
      { prev: '', text: 'CHAPTER I', next: 'It was the best of times, it was the worst of times, and everybody knew it.', pos: 0.0 },
      'L1 P0 Q0 NX1 PV0',
    ],
    [{ prev: 'short', text: '后记', next: '这本书到这里就结束了，感谢每一位读者的陪伴与支持。', pos: 0.99 }, 'L0 P0 Q3 NX1 PV0'],
    [{ prev: '', text: '', next: '', pos: 0.5 }, 'L0 P0 Q2 NX0 PV0'],
  ];

  it.each(cases)('%o → %s', (ctx, expected) => {
    expect(featTokens(ctx)).toBe(expected);
  });

  it('makeModelInput 拼接格式正确', () => {
    const input = makeModelInput({ prev: 'a', text: '第一章', next: 'bbb', pos: 0.1 });
    expect(input).toBe('L0 P0 Q0 NX0 PV0 [SEP] a [SEP] 第一章 [SEP] bbb');
  });
});
