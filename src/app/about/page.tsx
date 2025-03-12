import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getUserInfo } from '@/lib/github';
import PostContentWrapper from '@/components/post-content-wrapper';
import '@/styles/markdown.css';

export const metadata = {
  title: '关于我 | 博客',
  description: '博客作者的GitHub个人介绍'
};

export default function AboutPage() {
  const userInfo = getUserInfo();
  
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 max-w-3xl py-12">
        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-blue-500 mb-6 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          返回首页
        </Link>
        
        {/* 移除导航组件，已在顶部全局添加 */}
        
        <header className="mb-8 pb-6 border-b border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">关于我</h1>
          
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-shrink-0">
              <a 
                href={userInfo.html_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block hover:opacity-90 transition-opacity"
              >
                <Image 
                  src={userInfo.avatar_url}
                  alt={userInfo.name}
                  width={120}
                  height={120}
                  className="rounded-full border-4 border-white shadow-md"
                />
              </a>
            </div>
            
            <div className="flex-grow">
              <h2 className="text-2xl font-bold text-gray-800 mb-1">{userInfo.name}</h2>
              <a 
                href={userInfo.html_url} 
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-blue-500 text-sm mb-3 inline-block"
              >
                @{userInfo.login}
              </a>
              
              {userInfo.bio && (
                <p className="text-gray-700 mb-3">{userInfo.bio}</p>
              )}
              
              <div className="flex flex-wrap gap-y-2 gap-x-4">
                {userInfo.location && (
                  <p className="text-gray-600 text-sm flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    {userInfo.location}
                  </p>
                )}
                
                {userInfo.blog && (
                  <a 
                    href={userInfo.blog.startsWith('http') ? userInfo.blog : `https://${userInfo.blog}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-sm hover:underline flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                    </svg>
                    个人网站
                  </a>
                )}
                
                {userInfo.twitter_username && (
                  <a 
                    href={`https://twitter.com/${userInfo.twitter_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723 10.054 10.054 0 01-3.127 1.184 4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                    </svg>
                    Twitter
                  </a>
                )}
              </div>
              
              {userInfo.public_repos !== undefined && (
                <div className="flex gap-4 mt-3">
                  <div className="text-sm">
                    <span className="font-semibold">{userInfo.public_repos}</span>
                    <span className="text-gray-500 ml-1">仓库</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">{userInfo.followers}</span>
                    <span className="text-gray-500 ml-1">粉丝</span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">{userInfo.following}</span>
                    <span className="text-gray-500 ml-1">关注</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        
        {/* GitHub README.md 内容 */}
        <div className="bg-white rounded-lg overflow-hidden">
          {userInfo.readme_content ? (
            <PostContentWrapper content={userInfo.readme_content} />
          ) : (
            <div className="p-6 text-center text-gray-500">
              未找到个人介绍内容。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
