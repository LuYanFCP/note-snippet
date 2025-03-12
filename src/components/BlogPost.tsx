import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import '../styles/markdown.css';

interface Tag {
  [key: string]: any;
}

interface Post {
  title: string;
  date: string | Date;
  content: string;
  tags?: string[];
}

interface BlogPostProps {
  post: Post;
}

const BlogPost: React.FC<BlogPostProps> = ({ post }) => {
  return (
    <article className="blog-post">
      <h1>{post.title}</h1>
      <div className="metadata">
        <span className="date">{new Date(post.date).toLocaleDateString()}</span>
        {post.tags && post.tags.map(tag => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>
      <MarkdownRenderer content={post.content} />
    </article>
  );
};

export default BlogPost;
