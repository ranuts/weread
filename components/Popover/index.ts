import 'ranui/popover'; // 同时注册 <r-content>
import { Div, View, createRef, onCleanup } from 'ranui/builder';
import { EVENT_NAME, syncHook } from '@/lib/subscribe';
import type { ElementBuilder } from 'ranui/builder';

/** builder 可接受的子节点（触发器 / 浮层内容）。 */
type Node = ElementBuilder | HTMLElement | string;

export interface PopoverOptions {
  placement: 'top' | 'left' | 'right' | 'bottom';
  trigger: 'hover' | 'click';
  /** 触发器（默认插槽内容）。 */
  children: Node;
  /** 浮层内容，进 `<r-content>`。 */
  overlay: Node;
}

/** r-popover 元素上挂着的命令式关闭方法（组件实例只读属性）。 */
type PopoverEl = HTMLElement & { closePopover?: () => void };

/**
 * 全局已挂载的 popover 关闭器注册表——用于「同时只开一个」：任一 popover 的触发器被点开时，
 * 关闭其余所有。r-content 浮层被 portal 到 body 级容器（不在 r-popover 宿主内），故浮层内的点击
 * **不会**冒泡到宿主——宿主上的 click 只由触发器交互产生，正好用来做「开我即关别人」。
 */
const openRegistry = new Set<() => void>();

/**
 * `<r-popover>` + `<r-content>` 的 builder 薄封装。
 * 订阅 `CLOSE_POPOVER`（如目录/搜索结果点击后关闭浮层），`onCleanup` 里解绑；
 * 命令式 `closePopover()` 通过 ref 调用组件实例方法。必须在 `createRoot` 作用域内调用。
 * 「同时只开一个」：触发器点击时关闭注册表里的其他 popover。
 */
export const renderPopover = ({ placement, trigger, children, overlay }: PopoverOptions): ElementBuilder => {
  const ref = createRef<PopoverEl>();
  const closePopover = (): void => ref.current?.closePopover?.();

  syncHook.tap(EVENT_NAME.CLOSE_POPOVER, closePopover);
  openRegistry.add(closePopover);
  onCleanup(() => {
    syncHook.off(EVENT_NAME.CLOSE_POPOVER, closePopover);
    openRegistry.delete(closePopover);
  });

  // 触发器点击 → 关闭其余所有 popover（保证同时只开一个）。self 跳过（由 r-popover 自身 toggle）。
  const closeOthers = (): void => openRegistry.forEach((fn) => fn !== closePopover && fn());

  return Div().children(
    View('r-popover')
      .ref(ref)
      .attr('placement', placement)
      .attr('trigger', trigger)
      .on('click', closeOthers)
      .children(children, View('r-content').children(Div().children(overlay))),
  );
};
