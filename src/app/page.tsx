import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import postsData from '@/data/posts.json';
import tagsData from '@/data/tags.json';
import TagCloud from '@/components/TagCloud';
import { siteConfig } from '@/config/site';
import { RELEASE_TAG } from '@/lib/github'; // Import the Release tag constant
import '@/styles/home.css'; 
import '@/styles/posts.css';

// 从静态 JSON 文件获取数据
export async function generateStaticParams() {
  // 这是一个构建时运行的函数
  return [];
}

// 获取所有文章的静态数据
export async function generateMetadata() {
  return {
    title: 'Issue Blog - 小清新技术博客',
    description: '基于GitHub Issues的简约博客系统'
  };
}

// 修改为接收正确类型的 searchParams
export default function HomePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  // 从 URL 参数获取搜索词，正确处理可能的数组情况
  const searchFromUrl = typeof searchParams.search === 'string' 
    ? searchParams.search 
    : Array.isArray(searchParams.search) 
      ? searchParams.search[0] 
      : '';
      
  const tagFromUrl = typeof searchParams.tag === 'string'
    ? searchParams.tag
    : Array.isArray(searchParams.tag)
      ? searchParams.tag[0]
      : '';
  
  // 预处理数据
  const posts = postsData || [];
  const tags = tagsData || [];
  
  // 根据标签和搜索词筛选文章
  const filteredPosts = React.useMemo(() => {
    let results = [...posts];
    const activeFilter = tagFromUrl || 'all';
    
    // 应用标签筛选
    if (activeFilter !== 'all') {
      results = results.filter(post => 
        post.labels?.some(label => label.name.toLowerCase() === activeFilter.toLowerCase())
      );
    }
    
    // 应用搜索
    if (searchFromUrl) {
      const term = searchFromUrl.toLowerCase();
      results = results.filter(post => 
        post.title.toLowerCase().includes(term) || 
        post.excerpt?.toLowerCase().includes(term)
      );
    }
    
    return results;
  }, [posts, searchFromUrl, tagFromUrl]);
  
  // 当有搜索词时不显示顶部简介
  const showIntro = !searchFromUrl;

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部简介区域 - 仅当没有搜索词时显示 */}
      {showIntro && (
        <section className="bg-gradient-to-b from-blue-50 to-white py-12 mb-6">
          <div className="container mx-auto px-4 max-w-4xl">
            <h1 className="text-3xl md:text-4xl font-medium text-gray-800 mb-4">
              <span className="text-blue-500">{siteConfig.titlePrefix}</span> {siteConfig.titleSuffix}
            </h1>
            <p className="text-gray-600 max-w-2xl">
              {siteConfig.description}
            </p>
          </div>
        </section>
      )}

      {/* 搜索结果提示 - 当有搜索词时显示 */}
      {searchFromUrl && (
        <section className="container mx-auto px-4 max-w-4xl pt-16 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-gray-800">
              搜索结果: <span className="text-blue-500">"{searchFromUrl}"</span>
            </h2>
            <Link 
              href="/"
              className="text-sm text-gray-500 hover:text-blue-500 flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
              清除搜索
            </Link>
          </div>
        </section>
      )}

      {/* 内容区域 */}
      <div className="container mx-auto px-4 max-w-4xl pb-16">
        {/* 标签云 - 水平布局 */}
        <div className="mb-8">
          <TagCloud 
            tags={tags}
            activeTag={tagFromUrl || 'all'}
            compact={true}
          />
        </div>
        
        {/* 移除导航组件，已在顶部全局添加 */}

        {/* 文章列表 */}
        {filteredPosts.length === 0 ? (
          <div className="empty-state">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-xl font-medium text-gray-600 mb-2">未找到相关文章</h3>
            <p className="text-gray-500">尝试使用不同的搜索词或筛选条件</p>
            <Link 
              href="/"
              className="mt-4 text-blue-500 hover:text-blue-600"
            >
              重置筛选
            </Link>
          </div>
        ) : (
          <div className="yuque-posts-list">
            {filteredPosts.map((post) => (
              <article key={post.id} className="yuque-post-item">
                <Link href={`/${post.id}`} className="yuque-post-link">
                  <h2 className="yuque-post-title">
                    {post.title}
                    {/* 显示已发布标记，但因为我们已经过滤了，所以这个标记可能是多余的，但保留作为视觉指示 */}
                    <span className="release-badge ml-2 text-xs font-normal bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      已发布
                    </span>
                  </h2>
                </Link>
                
                <p className="yuque-post-excerpt">
                  {post.excerpt}
                </p>
                
                <div className="yuque-post-meta">
                  <div className="yuque-post-info">
                    <div className="yuque-post-avatar">
                      <Image 
                        src={post.user.avatar_url}
                        alt={post.user.login}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                    </div>
                    <span className="yuque-post-author">{post.user.login}</span>
                    <span className="yuque-post-date">
                      {new Date(post.created_at).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  
                  <div className="yuque-post-tags">
                    {post.labels?.map(label => (
                      <Link 
                        key={label.name} 
                        href={`/?tag=${encodeURIComponent(label.name.toLowerCase())}`}
                        className="yuque-tag"
                      >
                        {label.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
