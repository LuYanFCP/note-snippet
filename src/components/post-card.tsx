import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface PostCardProps {
  post: {
    id: number;
    title: string;
    body: string;
    created_at: string;
    labels: Array<{ name: string }>;
    user: {
      login: string;
      avatar_url: string;
    };
  };
}

export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  // Format the date
  const formattedDate = new Date(post.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Get a preview of the post body (first 150 characters)
  const bodyPreview = post.body.length > 150
    ? `${post.body.substring(0, 150).replace(/[#*`]/g, '')}...`
    : post.body.replace(/[#*`]/g, '');

  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
      <Link href={`/${post.id}`}>
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2 line-clamp-2">{post.title}</h2>
          
          <div className="flex items-center mb-3">
            <div className="h-6 w-6 rounded-full overflow-hidden mr-2">
              <Image 
                src={post.user.avatar_url} 
                alt={post.user.login} 
                width={24} 
                height={24} 
              />
            </div>
            <span className="text-sm text-gray-600">{post.user.login}</span>
            <span className="mx-2 text-gray-400">•</span>
            <span className="text-sm text-gray-500">{formattedDate}</span>
          </div>
          
          <p className="text-gray-600 text-sm line-clamp-3 mb-4">{bodyPreview}</p>
          
          {post.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-auto">
              {post.labels.map((label, index) => (
                <span 
                  key={index}
                  className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
};