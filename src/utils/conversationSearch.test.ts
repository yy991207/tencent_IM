import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterConversationListByKeyword,
  filterTopicBookmarksByKeyword,
} from './conversationSearch.ts';

test('空关键词时，保留全部会话', () => {
  const conversationList = [
    { conversationID: 'C2Calice', getShowName: () => 'Alice' },
    { conversationID: 'GROUPteam', getShowName: () => '项目组' },
  ];

  const result = filterConversationListByKeyword(conversationList, '   ');

  assert.equal(result.length, 2);
  assert.deepEqual(result, conversationList);
});

test('可以按会话标题和最后一条消息过滤会话', () => {
  const conversationList = [
    {
      conversationID: 'C2Calice',
      getShowName: () => 'Alice',
      userProfile: {
        nick: '小A',
        userID: 'alice',
      },
      lastMessage: {
        messageForShow: '今晚一起看方案',
      },
    },
    {
      conversationID: 'GROUPteam',
      getShowName: () => '项目群',
      groupProfile: {
        name: '项目群',
        groupID: 'team',
      },
      lastMessage: {
        messageForShow: '周会改到下午三点',
      },
    },
  ];

  const titleResult = filterConversationListByKeyword(conversationList, '项目');
  const messageResult = filterConversationListByKeyword(conversationList, '三点');

  assert.equal(titleResult.length, 1);
  assert.equal(titleResult[0]?.conversationID, 'GROUPteam');
  assert.equal(messageResult.length, 1);
  assert.equal(messageResult[0]?.conversationID, 'GROUPteam');
});

test('可以按话题标题和摘要过滤收藏入口', () => {
  const topicBookmarks = [
    {
      groupID: 'community-1',
      messageId: 'm-1',
      groupName: '社群测试1',
      title: '智能化工程 8 个段位',
      preview: '这篇内容讲怎么拆分上下文工程和复利工程',
    },
    {
      groupID: 'community-2',
      messageId: 'm-2',
      groupName: '前端周刊',
      title: 'CSS 变量实践',
      preview: '讲主题色和组件复用',
    },
  ];

  const result = filterTopicBookmarksByKeyword(topicBookmarks, '复利工程');

  assert.equal(result.length, 1);
  assert.equal(result[0]?.messageId, 'm-1');
});
