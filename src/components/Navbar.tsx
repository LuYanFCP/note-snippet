'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const Navbar = () => {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearch(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      // 导航到主页并传递搜索参数
      router.push(`/?search=${encodeURIComponent(searchTerm.trim())}`);
      setShowSearch(false);
    }
  };

  return (
    <header 
      className={`fixed w-full top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white shadow-sm py-3' : 'bg-white py-3'
      }`}
    >
      <div className="container mx-auto px-4 max-w-4xl flex justify-between items-center">
        <Link href="/" className="text-gray-800 font-medium text-xl">
          Issue <span className="text-blue-500">Blog</span>
        </Link>
        
        <nav className="hidden md:flex space-x-8">
          <NavLink href="/" currentPath={pathname}>首页</NavLink>
          <NavLink href="/about" currentPath={pathname}>关于</NavLink>
        </nav>
        
        <div className="flex items-center space-x-4">
          {/* 搜索按钮和弹出搜索框 */}
          <div className="relative" ref={searchRef}>
            <button 
              onClick={() => setShowSearch(!showSearch)}
              className="text-gray-600 hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50"
              aria-label="搜索"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            
            {showSearch && (
              <div className="absolute right-0 top-10 bg-white rounded-lg shadow-lg p-3 w-72 transition-all">
                <form onSubmit={handleSearch} className="flex items-center">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索文章..."
                    className="w-full p-2 border border-gray-200 rounded-lg focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    autoFocus
                  />
                  <button 
                    type="submit" 
                    className="ml-2 p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </form>
              </div>
            )}
          </div>
          
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

const NavLink = ({ href, children, currentPath }) => {
  const isActive = currentPath === href;
  
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

export default Navbar;
