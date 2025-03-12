import React from 'react';
import Link from 'next/link';

function CustomErrorPage({ statusCode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full text-center">
        <div className="mb-6">
          <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          {statusCode ? `错误 ${statusCode}` : '发生错误'}
        </h1>
        <p className="text-gray-600 mb-6">
          {statusCode === 404 
            ? '页面不存在或已被移除。' 
            : '很抱歉，服务器遇到了问题。'}
        </p>
        <Link 
          href="/" 
          className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-lg transition-colors"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

CustomErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default CustomErrorPage;
