import { createSignal, subscribers } from 'ranuts/utils';
import type { BookInfo } from '@/store/books';
import type { TextSyntaxTree } from '@/lib/transformText';
import type { BookNote } from '@/store/notes';

export enum EVENT_NAME {
  CLOSE_POPOVER = 'close-popover',
  SET_CURRENT_BOOK_PAGE = 'set-current-book-page',
  SET_CURRENT_BOOK_DETAIL = 'set-current-book-detail',
  SET_TEXT_SYNTAX_TREE = 'set-text-syntax-tree',
  SET_CHAPTER_DETECT = 'set-chapter-detect',
  /** 阅读设置（字号/行距/边距/主题/字体）变更 → 阅读页重排 + 面板同步（见 store/settings.ts） */
  SET_READING_SETTINGS = 'set-reading-settings',
  /** 当前书的划线/笔记列表变更 → 正文重渲高亮 + 笔记面板同步（见 store/notes.ts） */
  SET_BOOK_NOTES = 'set-book-notes',
  /** 目录里的「识别更多章节」按钮 → 请求阅读页跑一次模型增强（省流量场景的手动出口） */
  RUN_ENHANCE = 'run-enhance',
}

/**
 * 章节自动识别（模型增强）的共享状态——让**目录模块**能就地展示 loading / 手动入口，
 * 而不必把状态耦合在阅读页里。
 * - `idle`：无需增强或已完成（章节即终态）。
 * - `detecting`：模型正在下载/识别，目录显进度圈 + 文案。
 * - `available`：可增强但未自动跑（如省流量/慢网），目录显「识别更多章节」按钮。
 */
export interface ChapterDetectState {
  status: 'idle' | 'detecting' | 'available';
  phase: 'download' | 'detect';
  progress: number;
}

export const syncHook = subscribers;

export const [getCurrentBookDetail, setCurrentBookDetail] = createSignal<BookInfo>(
  {},
  { subscriber: EVENT_NAME.SET_CURRENT_BOOK_DETAIL },
);

export const [getTextSyntaxTree, setTextSyntaxTree] = createSignal<TextSyntaxTree>(
  {
    sequences: [],
    totalPage: 0,
    pageText: [],
    pageTitleId: [],
    titleIdTitle: [],
    titleIdPage: {},
  },
  { subscriber: EVENT_NAME.SET_TEXT_SYNTAX_TREE },
);

export const [getPageNum, setPageNum] = createSignal<number>(0, { subscriber: EVENT_NAME.SET_CURRENT_BOOK_PAGE });

export const [getChapterDetect, setChapterDetect] = createSignal<ChapterDetectState>(
  { status: 'idle', phase: 'download', progress: 0 },
  { subscriber: EVENT_NAME.SET_CHAPTER_DETECT },
);

/** 当前书的划线/笔记（阅读页加载后填充，正文渲染 + 笔记面板共享）。 */
export const [getBookNotes, setBookNotes] = createSignal<BookNote[]>([], { subscriber: EVENT_NAME.SET_BOOK_NOTES });
