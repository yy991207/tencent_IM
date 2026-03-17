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

// 会话 customData 存储话题收藏（每个会话 customData 最大 256 bytes）
const TOPIC_BOOKMARK_CUSTOMDATA_KEY = 'community_topic_bookmarks_v1';
const MAX_CUSTOMDATA_BYTES = 256;

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

function safeStringify(data: any, fallback = ''): string {
  try {
    return JSON.stringify(data);
  } catch {
    return fallback;
  }
}

function getByteLength(str: string): number {
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    return str.length;
  }
}

function parseTopicBookmarkIdsFromCustomData(customData: string | undefined | null): string[] {
  const obj = safeParse(customData, {});
  const raw = obj?.[TOPIC_BOOKMARK_CUSTOMDATA_KEY];
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === 'string' && x.trim());
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildCustomDataWithTopicBookmarks(ids: string[]): string {
  // 说明：customData 的限制是 256 bytes，这里优先保证“能写入成功”。
  // 若收藏太多，会自动丢弃最早的（数组头部），避免接口失败。
  const uniq = Array.from(new Set((ids || []).filter(Boolean)));
  for (let start = 0; start < uniq.length; start++) {
    const slice = uniq.slice(start);
    const payload = {
      [TOPIC_BOOKMARK_CUSTOMDATA_KEY]: slice,
    };
    const str = safeStringify(payload, '');
    if (!str) continue;
    if (getByteLength(str) <= MAX_CUSTOMDATA_BYTES) return str;
  }
  // 兜底：实在超限就写空
  return safeStringify({ [TOPIC_BOOKMARK_CUSTOMDATA_KEY]: [] }, '{}');
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
    let allMessages: any[] = [];
    try {
      allMessages = await fetchAll();
    } catch {
      // 社群被删除/无权限/会话不可用时，SDK 可能会在内部打印 emptyMessageBody 等日志。
      // 这里直接返回空列表，避免反复重试导致刷屏。
      return [];
    }

    if (allMessages.length > 0 || attempt === MAX_RETRIES) {
      return parseCommunityMessages(allMessages, bookmarkedIds);
    }

    // 空结果 —— SDK 可能仍在后台同步，等待后重试
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }

  return []; // fallback
}

// ─── 话题收藏（SDK customData）────────────────────────────

/**
 * 从会话 customData 读取“话题收藏 messageId 列表”。
 * 注意：该数据是“会话维度 + 当前用户维度”，适合做个人收藏。
 */
export async function loadTopicBookmarkIdsFromConversation(conversationID: string): Promise<Set<string>> {
  if (!conversationID) return new Set();
  const engine: any = TUIChatEngine as any;
  try {
    // 优先从会话档案读取，避免依赖本地缓存是否已加载
    const res = await engine?.TUIConversation?.getConversationProfile?.(conversationID);
    const conv = res?.data?.conversation || res?.data || res;
    const customData = conv?.customData || '';
    return new Set(parseTopicBookmarkIdsFromCustomData(customData));
  } catch {
    return new Set();
  }
}

/**
 * 写入会话 customData（最大 256 bytes，超限会自动裁剪）。
 */
export async function saveTopicBookmarkIdsToConversation(conversationID: string, ids: Set<string>): Promise<void> {
  if (!conversationID) return;
  const chat = getChat();
  const list = Array.from(ids || new Set());
  const customData = buildCustomDataWithTopicBookmarks(list);
  try {
    await chat.setConversationCustomData({
      conversationIDList: [conversationID],
      customData,
    });
  } catch {
    // 写入失败时不阻塞主流程（可能是权限/网络/长度等原因）
  }
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

// ─── 群组信息获取 ──────────────────────────────────────────

/**
 * 获取群组资料（包含成员总数、公告等）
 */
export async function getGroupProfile(groupID: string): Promise<any> {
  const chat = getChat();
  try {
    const res = await chat.getGroupProfile({ groupID });
    return res.data.group;
  } catch (err) {
    console.error('[Community] Failed to get group profile:', err);
    return null;
  }
}

/**
 * 获取群组中的机器人总数
 * 逻辑：拉取群成员列表，统计 userID 以 @RBT# 开头的成员
 */
export async function getGroupRobotCount(groupID: string): Promise<number> {
  const chat = getChat();
  try {
    const res = await chat.getGroupMemberList({ groupID, count: 100, offset: 0 });
    const memberList = res.data.memberList || [];
    return memberList.filter((m: any) => m.userID && m.userID.startsWith('@RBT#')).length;
  } catch (err) {
    console.error('[Community] Failed to get group robot count:', err);
    return 0;
  }
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
