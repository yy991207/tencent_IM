type SearchableConversation = {
  getShowName?: () => string;
  groupProfile?: {
    name?: string;
    groupID?: string;
  };
  userProfile?: {
    nick?: string;
    userID?: string;
    userId?: string;
  };
  conversationID?: string;
  lastMessage?: {
    messageForShow?: string;
    payload?: {
      text?: string;
      data?: unknown;
    };
  };
};

type SearchableTopicBookmark = {
  title?: string;
  preview?: string;
  groupName?: string;
  groupID?: string;
  messageId?: string;
};

export function filterConversationListByKeyword<T extends SearchableConversation>(
  conversationList: T[],
  keyword: string,
): T[] {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) return conversationList;

  return conversationList.filter((conversation) => {
    return buildConversationSearchText(conversation).includes(normalizedKeyword);
  });
}

export function filterTopicBookmarksByKeyword<T extends SearchableTopicBookmark>(
  topicBookmarks: T[],
  keyword: string,
): T[] {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) return topicBookmarks;

  return topicBookmarks.filter((topicBookmark) => {
    return buildTopicBookmarkSearchText(topicBookmark).includes(normalizedKeyword);
  });
}

function buildConversationSearchText(conversation: SearchableConversation): string {
  const showName = typeof conversation?.getShowName === 'function'
    ? String(conversation.getShowName() || '')
    : '';
  const groupName = String(conversation?.groupProfile?.name || '');
  const groupID = String(conversation?.groupProfile?.groupID || '');
  const userNick = String(conversation?.userProfile?.nick || '');
  const userID = String(conversation?.userProfile?.userID || conversation?.userProfile?.userId || '');
  const conversationID = String(conversation?.conversationID || '');
  const lastMessageText = getConversationLastMessageText(conversation?.lastMessage);

  return `${showName} ${groupName} ${groupID} ${userNick} ${userID} ${conversationID} ${lastMessageText}`.toLowerCase();
}

function buildTopicBookmarkSearchText(topicBookmark: SearchableTopicBookmark): string {
  const title = String(topicBookmark?.title || '');
  const preview = String(topicBookmark?.preview || '');
  const groupName = String(topicBookmark?.groupName || '');
  const groupID = String(topicBookmark?.groupID || '');
  const messageId = String(topicBookmark?.messageId || '');

  return `${title} ${preview} ${groupName} ${groupID} ${messageId}`.toLowerCase();
}

function getConversationLastMessageText(lastMessage: SearchableConversation['lastMessage']): string {
  const rawText = String(lastMessage?.messageForShow || lastMessage?.payload?.text || '').trim();
  if (rawText && rawText !== 'null') return rawText;

  const payloadData = lastMessage?.payload?.data;
  if (!payloadData) return '';

  try {
    const parsedData = typeof payloadData === 'string'
      ? JSON.parse(payloadData)
      : payloadData;

    if (Array.isArray((parsedData as { chunks?: unknown[] })?.chunks)) {
      return (parsedData as { chunks: unknown[] }).chunks
        .map((item) => String(item || ''))
        .join('');
    }
  } catch {
    // 这里是搜索兜底逻辑，解析失败时直接忽略自定义消息体即可。
  }

  return '';
}
