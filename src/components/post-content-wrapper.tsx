"use client";

import dynamic from 'next/dynamic';
import React from 'react';

// 动态导入客户端组件，避免SSR
const PostContent = dynamic(() => import('./post-content'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-96 bg-gray-100 rounded-md"></div>
});

interface PostContentWrapperProps {
  content: string;
}

export default function PostContentWrapper({ content }: PostContentWrapperProps) {
  return <PostContent content={content} />;
}
