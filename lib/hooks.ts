export enum DEVICE_ENUM {
  UNKNOWN = 'unknown',
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
}

const MOBILE_QUERY = '(max-width: 768px)';

/** 同步读取当前设备（SSR 环境返回 UNKNOWN）。 */
export const getDevice = (): DEVICE_ENUM => {
  if (typeof window === 'undefined') return DEVICE_ENUM.UNKNOWN;
  return window.matchMedia(MOBILE_QUERY).matches ? DEVICE_ENUM.MOBILE : DEVICE_ENUM.DESKTOP;
};

/**
 * 监听设备变化（替代原 React `useCheckDevice`）。返回取消订阅函数，
 * 在页面 `createRoot` 里配合 `onCleanup` 使用。回调会先同步触发一次当前值。
 */
export const watchDevice = (cb: (device: DEVICE_ENUM) => void): (() => void) => {
  if (typeof window === 'undefined') {
    cb(DEVICE_ENUM.UNKNOWN);
    return () => {};
  }
  const mql = window.matchMedia(MOBILE_QUERY);
  const handler = (): void => cb(mql.matches ? DEVICE_ENUM.MOBILE : DEVICE_ENUM.DESKTOP);
  handler();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
};
