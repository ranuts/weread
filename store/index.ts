import { WebDB } from '@/lib/indexedDB';
import { createBookStore } from '@/store/books';

// v2 新增 books_chapters（章节识别缓存）；v3 新增 books_progress（阅读进度/续读）
export const db = new WebDB({ dbName: 'read', version: 3 });

export const initDB = (): void => {
  db.openDataBase().then((result) => {
    if (result.status !== 'success') {
      createBookStore();
    }
  });
};
export const closeDB = (): void => {
  db.closeDataBase();
};

export const resumeDB = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    db.refreshDatabase()
      .then((result) => {
        if (result.status !== 'success') {
          createBookStore();
        }
        resolve(true);
      })
      .catch(() => {
        reject(false);
      });
  });
};
