/**
 * 社群消息服务层
 * 封装腾讯 IM SDK 操作，为 CommunityChatView 提供持久化的数据读写能力。
 *
 * 帖子和评论以 TIMCustomElem 自定义消息存储在群组会话中；
 * 点赞存储在帖子消息的 cloudCustomData 中；
 * 收藏存储在浏览器 localStorage 中。
 */
import TUIChatEngine from '@tencentcloud/chat-uikit-engine-lite';

// ─── 常量 ────────────────────────────────────────────────
export const BUSINESS_ID_POST = 'community_post';
export const BUSINESS_ID_COMMENT = 'community_comment';

// ─── 类型 ────────────────────────────────────────────────
export interface CommunityLikeUser {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

export interface CommunityComment {
  id: string;
  content: string;
  sender: string;
  senderID: string;
  time: Date;
  postMessageID: string;
}

export interface CommunityPost {
  id: string;
  content: string;
  sender: string;
  senderID: string;
  avatarUrl: string;
  time: Date;
  likes: CommunityLikeUser[];
  comments: CommunityComment[];
  bookmarked: boolean;
  /** 原始 SDK 消息对象，用于 modifyMessage 等操作 */
  _rawMessage: any;
}

// ─── 内部工具 ─────────────────────────────────────────────
function getChat(): any {
  return (TUIChatEngine as any).chat;
}

function safeParse(json: string | undefined | null, fallback: any = {}): any {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function toPost(msg: any, bookmarkedIds: Set<string>): CommunityPost | null {
  if (msg.type !== 'TIMCustomElem') return null;
  const data = safeParse(msg.payload?.data);
  if (data.businessID !== BUSINESS_ID_POST) return null;

  const cloudData = safeParse(msg.cloudCustomData);
  return {
    id: msg.ID,
    content: data.content || '',
    sender: msg.nick || msg.from || '未知',
    senderID: msg.from || '',
    avatarUrl: msg.avatar || '',
    time: new Date((msg.time || 0) * 1000),
    likes: cloudData.likes || [],
    comments: [],
    bookmarked: bookmarkedIds.has(msg.ID),
    _rawMessage: msg,
  };
}

function toComment(msg: any): CommunityComment | null {
  if (msg.type !== 'TIMCustomElem') return null;
  const data = safeParse(msg.payload?.data);
  if (data.businessID !== BUSINESS_ID_COMMENT || !data.postMessageID) return null;

  return {
    id: msg.ID,
    content: data.content || '',
    sender: msg.nick || msg.from || '未知',
    senderID: msg.from || '',
    time: new Date((msg.time || 0) * 1000),
    postMessageID: data.postMessageID,
  };
}

// ─── 消息加载 ─────────────────────────────────────────────

/**
 * 拉取社群群组的全部历史消息并解析为帖子+评论结构。
 *
 * SDK 冷启动场景：首次 getMessageList 会触发后台从服务端同步消息，
 * 但返回的 messageList 为空（availableLocalMessagesCount: 0）。
 * 此时自动等待短暂时间后重试，让 SDK 完成后台同步。
 */
export async function loadCommunityMessages(
  groupID: string,
  bookmarkedIds: Set<string>,
): Promise<CommunityPost[]> {
  const chat = getChat();
  const conversationID = `GROUP${groupID}`;

  const fetchAll = async (): Promise<any[]> => {
    const allMessages: any[] = [];
    let nextReqMessageID = '';
    let isCompleted = false;

    while (!isCompleted) {
      const options: any = { conversationID, count: 15 };
      if (nextReqMessageID) {
        options.nextReqMessageID = nextReqMessageID;
      }
      const res = await chat.getMessageList(options);
      const list: any[] = res.data?.messageList ?? [];
      allMessages.push(...list);
      nextReqMessageID = res.data?.nextReqMessageID ?? '';
      isCompleted = res.data?.isCompleted ?? true;
    }

    return allMessages;
  };

  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const allMessages = await fetchAll();

    if (allMessages.length > 0 || attempt === MAX_RETRIES) {
      return parseCommunityMessages(allMessages, bookmarkedIds);
    }

    // 空结果 —— SDK 可能仍在后台同步，等待后重试
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }

  return []; // fallback
}

/**
 * 将原始 SDK 消息列表解析为帖子数组（已关联评论）。
 */
export function parseCommunityMessages(
  rawMessages: any[],
  bookmarkedIds: Set<string>,
): CommunityPost[] {
  const posts: CommunityPost[] = [];
  const commentsMap = new Map<string, CommunityComment[]>();

  for (const msg of rawMessages) {
    const post = toPost(msg, bookmarkedIds);
    if (post) {
      posts.push(post);
      continue;
    }
    const comment = toComment(msg);
    if (comment) {
      const list = commentsMap.get(comment.postMessageID) || [];
      list.push(comment);
      commentsMap.set(comment.postMessageID, list);
    }
  }

  // 将评论挂到对应帖子并按时间排序
  for (const post of posts) {
    post.comments = (commentsMap.get(post.id) || []).sort(
      (a, b) => a.time.getTime() - b.time.getTime(),
    );
  }

  // 帖子按时间升序
  posts.sort((a, b) => a.time.getTime() - b.time.getTime());

  return posts;
}

// ─── 发送帖子 ─────────────────────────────────────────────

export async function sendPost(groupID: string, content: string): Promise<any> {
  const chat = getChat();
  const message = chat.createCustomMessage({
    to: groupID,
    conversationType: (TUIChatEngine as any).TYPES.CONV_GROUP,
    payload: {
      data: JSON.stringify({ businessID: BUSINESS_ID_POST, content }),
      description: content.slice(0, 100),
      extension: '',
    },
    cloudCustomData: JSON.stringify({ likes: [] }),
  });
  return chat.sendMessage(message);
}

// ─── 发送评论 ─────────────────────────────────────────────

export async function sendComment(
  groupID: string,
  postMessageID: string,
  content: string,
): Promise<any> {
  const chat = getChat();
  const message = chat.createCustomMessage({
    to: groupID,
    conversationType: (TUIChatEngine as any).TYPES.CONV_GROUP,
    payload: {
      data: JSON.stringify({ businessID: BUSINESS_ID_COMMENT, postMessageID, content }),
      description: content.slice(0, 100),
      extension: '',
    },
  });
  return chat.sendMessage(message);
}

// ─── 切换点赞 ─────────────────────────────────────────────

export async function toggleLike(
  rawMessage: any,
  userId: string,
  userName: string,
  avatarUrl?: string,
): Promise<{ liked: boolean; likes: CommunityLikeUser[] }> {
  const cloudData = safeParse(rawMessage.cloudCustomData);
  const likes: CommunityLikeUser[] = cloudData.likes || [];
  const idx = likes.findIndex((l) => l.userId === userId);
  let liked: boolean;

  if (idx >= 0) {
    likes.splice(idx, 1);
    liked = false;
  } else {
    likes.push({ userId, userName, avatarUrl });
    liked = true;
  }

  cloudData.likes = likes;
  rawMessage.cloudCustomData = JSON.stringify(cloudData);

  const chat = getChat();
  await chat.modifyMessage(rawMessage);

  return { liked, likes: [...likes] };
}

// ─── 转发帖子 ─────────────────────────────────────────────

export async function forwardPost(
  targetConversationID: string,
  groupName: string,
  postContent: string,
): Promise<any> {
  const chat = getChat();

  let to: string;
  let conversationType: string;
  if (targetConversationID.startsWith('GROUP')) {
    to = targetConversationID.slice(5);
    conversationType = (TUIChatEngine as any).TYPES.CONV_GROUP;
  } else if (targetConversationID.startsWith('C2C')) {
    to = targetConversationID.slice(3);
    conversationType = (TUIChatEngine as any).TYPES.CONV_C2C;
  } else {
    to = targetConversationID;
    conversationType = (TUIChatEngine as any).TYPES.CONV_C2C;
  }

  const text = `[转发自「${groupName}」] ${postContent}`;
  const message = chat.createTextMessage({
    to,
    conversationType,
    payload: { text },
  });
  return chat.sendMessage(message);
}

// ─── 收藏（localStorage）────────────────────────────────────

const BOOKMARK_KEY_PREFIX = 'community_bookmarks_';

export function loadBookmarks(userID: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${BOOKMARK_KEY_PREFIX}${userID}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function saveBookmarks(userID: string, ids: Set<string>): void {
  try {
    localStorage.setItem(`${BOOKMARK_KEY_PREFIX}${userID}`, JSON.stringify([...ids]));
  } catch {
    // localStorage 不可用时静默忽略
  }
}

// ─── 实时消息订阅 ─────────────────────────────────────────

/**
 * 订阅指定群组的新消息与消息修改事件。
 * 返回取消订阅的清理函数。
 */
export function subscribeMessages(
  groupID: string,
  onNewPost: (post: CommunityPost) => void,
  onNewComment: (comment: CommunityComment) => void,
  onPostModified: (postId: string, likes: CommunityLikeUser[], rawMessage: any) => void,
): () => void {
  const chat = getChat();
  const conversationID = `GROUP${groupID}`;
  const ENGINE = TUIChatEngine as any;

  const handleReceived = (event: any) => {
    const messages: any[] = event.data || [];
    for (const msg of messages) {
      if (msg.conversationID !== conversationID) continue;

      const post = toPost(msg, new Set());
      if (post) {
        onNewPost(post);
        continue;
      }
      const comment = toComment(msg);
      if (comment) {
        onNewComment(comment);
      }
    }
  };

  const handleModified = (event: any) => {
    const messages: any[] = event.data || [];
    for (const msg of messages) {
      if (msg.conversationID !== conversationID) continue;
      if (msg.type !== 'TIMCustomElem') continue;
      const data = safeParse(msg.payload?.data);
      if (data.businessID !== BUSINESS_ID_POST) continue;

      const cloudData = safeParse(msg.cloudCustomData);
      onPostModified(msg.ID, cloudData.likes || [], msg);
    }
  };

  chat.on(ENGINE.EVENT.MESSAGE_RECEIVED, handleReceived);
  if (ENGINE.EVENT.MESSAGE_MODIFIED) {
    chat.on(ENGINE.EVENT.MESSAGE_MODIFIED, handleModified);
  }

  return () => {
    chat.off(ENGINE.EVENT.MESSAGE_RECEIVED, handleReceived);
    if (ENGINE.EVENT.MESSAGE_MODIFIED) {
      chat.off(ENGINE.EVENT.MESSAGE_MODIFIED, handleModified);
    }
  };
}
