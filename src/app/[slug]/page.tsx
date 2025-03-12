import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import PostContentWrapper from '@/components/post-content-wrapper';
import '@/styles/markdown.css';

// 导入用于静态路径生成的数据
import allPosts from '@/data/posts.json';
import { getPostBySlug } from '@/lib/github';
import { Metadata } from 'next';

// Define the params type for better TypeScript support
type PageParams = {
  params: {
    slug: string;
  };
  searchParams: Record<string, string | string[] | undefined>;
};

// 添加generateStaticParams函数（必须为静态导出）
export function generateStaticParams() {
  // 从静态数据生成所有可能的路径
  return allPosts.map((post) => ({
    slug: post.id.toString(),
  }));
}

// Update the metadata generation function
export function generateMetadata(
  { params }: PageParams
): Metadata {
  const post = getPostBySlug(params.slug);
  
  if (!post) {
    return {
      title: '文章未找到',
      description: '抱歉，我们找不到您请求的文章。',
    };
  }

  return {
    title: post.title,
    description: post.body?.substring(0, 160) || '没有描述',
  };
}

// 静态页面组件
export default function PostPage({ params }: PageParams) {
  const { slug } = params;
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-6">文章未找到</h1>
        <p className="text-gray-600 mb-8">抱歉，我们找不到您请求的文章。</p>
        <a href="/posts" className="text-blue-500 hover:text-blue-600">
          返回文章列表
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <article className="container mx-auto px-4 max-w-3xl py-12">
        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-blue-500 mb-6 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          返回文章列表
        </Link>
        
        {/* 移除导航组件，已在顶部全局添加 */}
        
        <header className="mb-8 pb-6 border-b border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{post.title}</h1>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center">
              <Image 
                src={post.user.avatar_url}
                alt={post.user.login}
                width={32}
                height={32}
                className="rounded-full mr-3"
              />
              <div>
                <p className="text-gray-700 font-medium">{post.user.login}</p>
                <time className="text-sm text-gray-500">
                  {new Date(post.created_at).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
              </div>
            </div>
            
            {post.labels?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {post.labels.map(label => (
                  <Link 
                    href={`/?tag=${encodeURIComponent(label.name.toLowerCase())}`}
                    key={label.name} 
                    className="yuque-tag hover:bg-blue-50"
                  >
                    {label.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>
        
        {/* 使用客户端包装器组件 */}
        {post.body && <PostContentWrapper content={post.body} />}
        
        <div className="mt-12 pt-6 border-t border-gray-100">
          <Link 
            href="/"
            className="inline-flex items-center text-blue-500 hover:text-blue-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            查看更多文章
          </Link>
        </div>
      </article>
    </div>
  );
}