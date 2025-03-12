// 纯静态博客数据加载工具

// 导入预构建的静态数据
import postsData from '../data/posts.json';
import tagsData from '../data/tags.json';
import allContentData from '../data/all-content.json';
import userInfo from '../data/user-info.json';

// 文章接口定义
export interface Post {
  id: number;
  title: string;
  body?: string;
  excerpt?: string;
  created_at: string;
  updated_at?: string;
  labels: Array<{ name: string }>;
  user: {
    login: string;
    avatar_url: string;
  };
}

// 标签接口定义
export interface Tag {
  name: string;
  count: number;
}

// 用户信息接口定义
export interface UserInfo {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  bio?: string;
  blog?: string;
  location?: string;
  company?: string;
  twitter_username?: string;
  public_repos?: number;
  followers?: number;
  following?: number;
  readme_content: string;
}

// 用于控制过滤的标签名称
export const RELEASE_TAG = "Release";

/**
 * 获取单篇文章，从静态数据中获取 - 转换为同步函数
 */
export function getPostBySlug(slug: string): Post | null {
  // 只返回含有Release标签的文章
  const post = allContentData.find(post => 
    post.id.toString() === slug &&
    post.labels?.some(label => label.name === RELEASE_TAG)
  );
  
  if (!post) {
    console.warn(`没有找到ID为 ${slug} 的已发布文章`);
  }
  return post || null;
}

/**
 * 获取所有文章列表，从静态数据中获取 - 转换为同步函数
 * 只返回有Release标签的文章
 */
export function getAllPosts(): Post[] {
  return postsData.filter(post => 
    post.labels?.some(label => label.name === RELEASE_TAG)
  );
}

/**
 * 获取所有标签，从静态数据中获取 - 转换为同步函数
 * 只从有Release标签的文章中提取标签
 */
export function getAllTags(): Tag[] {
  // 先过滤出有Release标签的文章
  const releasedPosts = postsData.filter(post => 
    post.labels?.some(label => label.name === RELEASE_TAG)
  );
  
  // 然后从这些文章中提取标签
  const tagMap = new Map<string, number>();
  releasedPosts.forEach(post => {
    post.labels?.forEach(label => {
      // 不统计Release标签本身
      if (label.name !== RELEASE_TAG) {
        const count = tagMap.get(label.name) || 0;
        tagMap.set(label.name, count + 1);
      }
    });
  });
  
  // 将Map转换为Tag数组并排序
  return Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 获取用户信息和README内容，从静态数据中获取
 */
export function getUserInfo(): UserInfo {
  return userInfo;
}
