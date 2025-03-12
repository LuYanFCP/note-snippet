'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getAllPosts, getAllTags, RELEASE_TAG } from '@/lib/github';
import TagCloud from '@/components/TagCloud';
import '@/styles/home.css'; 
import '@/styles/posts.css';

export const metadata = {
  title: '所有文章 | 博客',
  description: '查看所有博客文章'
};

export default function PostsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPosts, setFilteredPosts] = useState([]);

  // 获取文章
  useEffect(() => {
    const fetchPosts = async () => {
      const allPosts = await getAllPosts();
      setPosts(allPosts);
      setFilteredPosts(allPosts);
      setLoading(false);
    };

    fetchPosts();
  }, []);

  // 处理筛选和搜索
  useEffect(() => {
    let results = [...posts];
    
    // 应用标签筛选
    if (activeFilter !== 'all') {
      results = results.filter(post => 
        post.labels?.some(label => label.name.toLowerCase() === activeFilter.toLowerCase())
      );
    }
    
    // 应用搜索
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(post => 
        post.title.toLowerCase().includes(term) || 
        post.body?.toLowerCase().includes(term)
      );
    }
    
    setFilteredPosts(results);
  }, [posts, activeFilter, searchTerm]);

  // 获取所有唯一标签
  const allTags = React.useMemo(() => {
    const tags = new Set();
    posts.forEach(post => {
      post.labels?.forEach(label => {
        tags.add(label.name.toLowerCase());
      });
    });
    return Array.from(tags);
  }, [posts]);

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 max-w-4xl py-12">
        {/* 标题 */}
        <h1 className="text-3xl font-bold text-gray-900 mb-6">所有文章</h1>
        
        {/* 移除导航组件，已在顶部全局添加 */}
        
        {/* 页面标题 - 更新设计 */}
        <section className="container mx-auto px-4 mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-light text-blue-800 mb-4 relative inline-block">
            <span className="text-blue-500 font-medium">博客</span> 文章
            <span className="absolute -bottom-2 left-0 w-full h-1 bg-gradient-to-r from-blue-300 to-blue-500 rounded-full"></span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto mt-4">
            探索各种话题的文章，从技术教程到思考随笔，这里记录了知识与创意的点滴。
          </p>
        </section>

        {/* 搜索和筛选 - 改进界面 */}
        <section className="container mx-auto px-4 mb-10">
          <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col md:flex-row justify-between items-center">
            {/* 搜索框 - 优化视觉效果 */}
            <div className="relative w-full md:w-auto mb-4 md:mb-0">
              <input
                type="text"
                placeholder="搜索文章..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-72 pl-12 pr-4 py-3 rounded-full border border-gray-100 bg-gray-50 focus:border-blue-300 focus:bg-white focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all"
              />
              <svg className="absolute left-4 top-3.5 h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            {/* 标签筛选 - 优化视觉设计 */}
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
              <button
                onClick={() => setActiveFilter('all')}
                className={`filter-tag ${activeFilter === 'all' ? 'active' : ''}`}
              >
                全部
              </button>
              
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveFilter(tag)}
                  className={`filter-tag ${activeFilter === tag ? 'active' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 文章列表 - 全新布局设计 */}
        <section className="container mx-auto px-4">
          {loading ? (
            <div className="loading-spinner">
              <div className="spinner"></div>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="empty-state">
              <svg className="w-20 h-20 text-gray-300 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-2xl font-medium text-gray-600 mb-3">未找到相关文章</h3>
              <p className="text-gray-500">尝试使用不同的搜索词或筛选条件</p>
              <button 
                onClick={() => {setSearchTerm(''); setActiveFilter('all');}} 
                className="mt-6 px-5 py-2 bg-blue-50 text-blue-500 rounded-full hover:bg-blue-100 transition-colors"
              >
                重置筛选
              </button>
            </div>
          ) : (
            <div className="posts-layout">
              {filteredPosts.map(post => (
                <article key={post.id} className="post-item">
                  <div className="post-date-badge">
                    <div className="post-date-wrapper">
                      <div className="post-day">{new Date(post.created_at).getDate()}</div>
                      <div className="post-month">{new Date(post.created_at).toLocaleString('zh-CN', { month: 'short' })}</div>
                    </div>
                  </div>
                  
                  <div className="post-content">
                    <Link href={`/${post.id}`} className="post-title-link">
                      <h2 className="post-title">
                        {post.title}
                        <span className="release-badge ml-2 text-xs font-normal bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          已发布
                        </span>
                      </h2>
                    </Link>
                    
                    <p className="post-excerpt">
                      {post.body?.substring(0, 160).replace(/[#*`]/g, '')}...
                    </p>
                    
                    <div className="post-footer">
                      <div className="post-meta">
                        <div className="flex items-center">
                          <Image 
                            src={post.user.avatar_url}
                            alt={post.user.login}
                            width={28}
                            height={28}
                            className="rounded-full border-2 border-white shadow-sm"
                          />
                          <span className="ml-2 text-sm text-gray-600 font-medium">{post.user.login}</span>
                        </div>
                      </div>
                      
                      <div className="post-tags">
                        {post.labels?.map(label => (
                          <span 
                            key={label.name} 
                            className="post-tag"
                            onClick={(e) => {e.preventDefault(); setActiveFilter(label.name.toLowerCase());}}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="post-actions">
                    <Link href={`/${post.id}`} className="read-more-link">
                      阅读全文
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          
          {/* 分页控件 */}
          {filteredPosts.length > 0 && (
            <div className="pagination">
              <div className="flex justify-center mt-12 space-x-2">
                <button className="pagination-button disabled">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                <button className="pagination-button active">1</button>
                <button className="pagination-button">2</button>
                <button className="pagination-button">3</button>
                <button className="pagination-button">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}