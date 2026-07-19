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
 * `<r-popover>` + `<r-content>` 的 builder 薄封装。
 * 订阅 `CLOSE_POPOVER`（如目录/搜索结果点击后关闭浮层），`onCleanup` 里解绑；
 * 命令式 `closePopover()` 通过 ref 调用组件实例方法。必须在 `createRoot` 作用域内调用。
 */
export const renderPopover = ({ placement, trigger, children, overlay }: PopoverOptions): ElementBuilder => {
  const ref = createRef<PopoverEl>();
  const closePopover = (): void => ref.current?.closePopover?.();

  syncHook.tap(EVENT_NAME.CLOSE_POPOVER, closePopover);
  onCleanup(() => syncHook.off(EVENT_NAME.CLOSE_POPOVER, closePopover));

  return Div().children(
    View('r-popover')
      .ref(ref)
      .attr('placement', placement)
      .attr('trigger', trigger)
      .children(children, View('r-content').children(Div().children(overlay))),
  );
};
