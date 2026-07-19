export const base = '/weread';
// export const base = '/packages/read/dist/client'

export enum ROUTE_PATH {
  HOME = `${base}/`,
  BOOK_DETAIL = `${base}/book-detail`,
  LOADING = `${base}/loading`,
}

/** 由 pathname 决定当前路由（MPA：整页导航，无客户端路由器）。 */
export const resolveRoute = (pathname: string): ROUTE_PATH => {
  const p = pathname.split('?')[0];
  if (p.includes('/book-detail')) return ROUTE_PATH.BOOK_DETAIL;
  if (p.includes('/loading')) return ROUTE_PATH.LOADING;
  return ROUTE_PATH.HOME;
};
