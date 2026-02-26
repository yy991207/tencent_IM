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
 * 可供选择的固定头像列表
 */
export const PRESET_GROUP_AVATARS = [
  { id: 'avatar-1', url: 'https://api.dicebear.com/7.x/identicon/svg?seed=avatar1&backgroundColor=b6e3f4', label: '几何1' },
  { id: 'avatar-2', url: 'https://api.dicebear.com/7.x/identicon/svg?seed=avatar2&backgroundColor=c0aede', label: '几何2' },
  { id: 'avatar-3', url: 'https://api.dicebear.com/7.x/identicon/svg?seed=avatar3&backgroundColor=d1d4f9', label: '几何3' },
  { id: 'avatar-4', url: 'https://api.dicebear.com/7.x/identicon/svg?seed=avatar4&backgroundColor=ffd5dc', label: '几何4' },
  { id: 'avatar-5', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=shape1&backgroundColor=b6e3f4', label: '形状1' },
  { id: 'avatar-6', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=shape2&backgroundColor=c0aede', label: '形状2' },
  { id: 'avatar-7', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=shape3&backgroundColor=d1d4f9', label: '形状3' },
  { id: 'avatar-8', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=shape4&backgroundColor=ffd5dc', label: '形状4' },
  { id: 'avatar-work', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=work-fixed-seed&backgroundColor=b6e3f4', label: '工作群默认' },
  { id: 'avatar-community', url: 'https://api.dicebear.com/7.x/shapes/svg?seed=community-fixed-seed&backgroundColor=ffdfbf', label: '社群默认' },
];

/**
 * 根据群组类型和名称生成头像 URL
 * @param groupName 群组名称
 * @param groupType 群组类型
 * @returns 头像 URL
 */
export function generateGroupAvatarByType(
  _groupName: string,
  groupType: GroupType
): string {
  // 根据用户要求，每种群类型固定一种头像，不再随名称随机生成
  // 数据源来自 DiceBear API
  if (groupType === 'Work') {
    return 'https://api.dicebear.com/7.x/bottts/svg?seed=work-fixed-seed&backgroundColor=b6e3f4';
  }
  if (groupType === 'Community') {
    return 'https://api.dicebear.com/7.x/shapes/svg?seed=community-fixed-seed&backgroundColor=ffdfbf';
  }
  
  return 'https://api.dicebear.com/7.x/identicon/svg?seed=default&backgroundColor=d1d4f9';
}
