/**
 * 群组头像生成工具
 * 使用 DiceBear 开源头像 API 生成群组头像
 * 文档：https://www.dicebear.com/
 */

// 支持的头像风格
export type AvatarStyle = 
  | 'bottts'        // 机器人风格
  | 'avataaars'     // 人物头像风格
  | 'identicon'     // 几何图形
  | 'pixel-art'     // 像素风格
  | 'shapes';       // 多彩图形

// 群组类型定义
export type GroupType = 'Work' | 'Public' | 'Meeting' | 'AVChatRoom' | 'Community';

/**
 * 群组类型与头像风格的映射关系
 * 每种群组类型使用不同的头像风格，便于视觉区分
 */
const groupTypeAvatarMap: Record<GroupType, AvatarStyle> = {
  'Work': 'bottts',        // 好友工作群 - 机器人风格，体现工作场景
  'Public': 'avataaars',   // 陌生人社交群 - 人物头像风格，体现社交属性
  'Meeting': 'identicon',  // 临时会议群 - 几何图形，体现正式感
  'AVChatRoom': 'pixel-art', // 直播群 - 像素风格，体现娱乐属性
  'Community': 'shapes',   // 社群 - 多彩图形，体现社区多样性
};

/**
 * 根据群组类型获取对应的头像风格
 * @param groupType 群组类型
 * @returns 头像风格
 */
export function getAvatarStyleByGroupType(groupType: GroupType): AvatarStyle {
  return groupTypeAvatarMap[groupType] || 'identicon';
}

/**
 * 生成群组头像 URL
 * @param seed 种子字符串（通常使用群组名称）
 * @param style 头像风格（可选，默认 identicon）
 * @returns DiceBear 头像 URL
 */
export function generateGroupAvatar(
  seed: string,
  style: AvatarStyle = 'identicon'
): string {
  // 使用 DiceBear API 生成头像
  // 参数说明：
  // - seed: 种子字符串，相同种子生成相同头像
  // - size: 头像尺寸
  // - backgroundColor: 背景颜色（透明）
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=100&backgroundColor=transparent`;
}

/**
 * 根据群组类型和名称生成头像 URL
 * @param groupName 群组名称
 * @param groupType 群组类型
 * @returns 头像 URL
 */
export function generateGroupAvatarByType(
  groupName: string,
  groupType: GroupType
): string {
  const style = getAvatarStyleByGroupType(groupType);
  return generateGroupAvatar(groupName, style);
}
