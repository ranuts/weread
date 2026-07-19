import { onCleanup, signal } from 'ranui/builder';
import { syncHook } from '@/lib/subscribe';
import type { EVENT_NAME } from '@/lib/subscribe';
import type { Getter } from 'ranui/builder';

/**
 * 把 `lib/subscribe.ts` 里 ranuts 的 store getter + 其事件桥接成一个 ranui signal。
 * 返回的 getter 可直接喂给 builder 的单值绑定（`.text()` / `.style(prop, getter)` /
 * `.class()` / `.boolAttr()` 等），store 每次 `set*` 触发事件即自动更新对应节点。
 *
 * 订阅由当前 `createRoot` 拥有：页面 dispose 时 `onCleanup` 自动解绑，避免泄漏。
 * 必须在页面工厂的 `createRoot` 作用域内调用。
 */
export function fromStore<T>(read: () => T, event: EVENT_NAME): Getter<T> {
  const [get, set] = signal<T>(read());
  const cb = (): void => set(() => read());
  syncHook.tap(event, cb);
  onCleanup(() => syncHook.off(event, cb));
  return get;
}
