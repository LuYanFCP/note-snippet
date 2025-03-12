import React from 'react';
import Link from 'next/link';
import { Tag } from '@/lib/github';

interface TagCloudProps {
  tags: Tag[];
  activeTag?: string;
  onTagClick?: (tag: string) => void;
  className?: string;
  compact?: boolean;
}

const TagCloud: React.FC<TagCloudProps> = ({ 
  tags, 
  activeTag = '', 
  className = '',
  compact = false
}) => {
  // 根据标签数量计算字体大小，最小 0.85rem，最大 1.2rem
  const maxCount = Math.max(...tags.map(tag => tag.count), 1);
  const getFontSize = (count: number) => {
    const size = 0.85 + (count / maxCount) * 0.35;
    return `${size}rem`;
  };
  
  // 如果没有标签，不显示组件
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm p-4 ${className} ${compact ? 'border border-gray-100' : ''}`}>
      {!compact && <h3 className="text-lg font-medium text-gray-800 mb-3">标签云</h3>}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className={`tag-cloud-item ${activeTag === 'all' ? 'active' : ''}`}
          style={{ fontSize: '1rem' }}
        >
          全部
        </Link>
        
        {tags.map(tag => (
          <Link
            key={tag.name}
            href={`/?tag=${encodeURIComponent(tag.name)}`}
            className={`tag-cloud-item ${activeTag === tag.name ? 'active' : ''}`}
            style={{ fontSize: compact ? '0.875rem' : getFontSize(tag.count) }}
            title={`${tag.count} 篇文章`}
          >
            {tag.name}
            {!compact && <span className="ml-1 text-xs text-gray-500">({tag.count})</span>}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default TagCloud;
