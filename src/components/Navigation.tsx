"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siteConfig } from '@/config/site';

export default function Navigation() {
  const pathname = usePathname();
  
  // Function to check if a path is active
  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="bg-white border-b border-gray-100 py-4 sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-4 max-w-4xl flex items-center justify-between">
        <Link href="/" className="font-medium text-xl text-gray-800">
          <span className="text-blue-500">{siteConfig.titlePrefix}</span> {siteConfig.titleSuffix}
        </Link>
        
        <div className="flex gap-6">
          <Link 
            href="/"
            className={`text-gray-600 hover:text-blue-600 transition-colors ${isActive('/') && pathname === '/' ? 'font-medium text-blue-600' : ''}`}
          >
            首页
          </Link>
          <Link 
            href="/about"
            className={`text-gray-600 hover:text-blue-600 transition-colors ${isActive('/about') ? 'font-medium text-blue-600' : ''}`}
          >
            关于我
          </Link>
        </div>
      </div>
    </nav>
  );
}
