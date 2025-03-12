import React from 'react';
import Link from 'next/link';

// 为静态页面创建的导航条组件
const StaticNavbar = () => {
  return (
    <header className="fixed w-full top-0 z-50 bg-white py-3 shadow-sm">
      <div className="container mx-auto px-4 max-w-4xl flex justify-between items-center">
        <Link href="/" className="text-gray-800 font-medium text-xl">
          Issue <span className="text-blue-500">Blog</span>
        </Link>
        
        <nav className="hidden md:flex space-x-8">
          <NavLink href="/" isActive={true}>首页</NavLink>
          <NavLink href="/about" isActive={false}>关于</NavLink>
        </nav>
        
        <div className="flex items-center space-x-4">
          {/* 搜索表单 - 在静态HTML中处理 */}
          <form action="/" method="get" className="relative">
            <input 
              type="text" 
              name="search"
              placeholder="搜索..." 
              className="hidden md:block w-32 py-1 px-3 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button 
              type="submit"
              className="md:hidden text-gray-600 p-1 rounded-full hover:bg-blue-50"
              aria-label="搜索"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>
          
          <Link 
            href="https://github.com" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-blue-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
};

const NavLink = ({ href, children, isActive }) => {
  return (
    <Link 
      href={href} 
      className={`relative text-sm font-medium transition-colors duration-300 py-1 ${
        isActive 
          ? 'text-blue-600' 
          : 'text-gray-600 hover:text-blue-600'
      }`}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full" />
      )}
    </Link>
  );
};

export default StaticNavbar;
