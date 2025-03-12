"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import 'katex/dist/katex.min.css';
import '@/styles/markdown.css';

// 移除metadata导出，因为这是客户端组件
interface PostContentProps {
  content: string;
}

interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
  [key: string]: any;
}

// 静态方式处理Mermaid图表
const MermaidDiagram = ({ chart }: { chart: string }) => {
  // 使用useEffect确保只在客户端执行
  React.useEffect(() => {
    // 动态导入mermaid库
    import('mermaid').then((mermaid) => {
      mermaid.default.initialize({
        startOnLoad: true,
        theme: 'neutral',
      });
      mermaid.default.contentLoaded();
    });
  }, []);

  return (
    <div className="mermaid-diagram my-4">
      <pre className="mermaid">
        {chart}
      </pre>
    </div>
  );
};

// 处理GitHub Issue图片URL
const processGithubImageUrl = (url: string): string => {
  if (url.includes('user-images.githubusercontent.com') || 
      url.includes('github.com') && (url.includes('/issues/') || url.includes('/pull/'))) {
    return url;
  }
  return url;
};

const PostContent = ({ content }: PostContentProps) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }: CodeProps) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            // 处理Mermaid图表
            if (language === 'mermaid') {
              return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
            }
            
            return !inline && match ? (
              <div className="code-block-container">
                {language && <div className="code-language-tag">{language}</div>}
                <SyntaxHighlighter
                  style={oneLight}
                  language={match[1]}
                  PreTag="div"
                  showLineNumbers={true}
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code className={className || ''} {...props}>
                {children}
              </code>
            );
          },
          img({ node, src, alt, ...props }) {
            // 处理图片URL
            const processedSrc = processGithubImageUrl(src);
            return (
              <img 
                className="rounded-md shadow-md my-4 mx-auto" 
                loading="lazy"
                src={processedSrc}
                alt={alt || ''}
                {...props}
                style={{ maxWidth: '100%' }}
              />
            );
          },
          table({ node, ...props }) {
            return (
              <div className="overflow-x-auto my-6">
                <table className="table-auto border-collapse w-full" {...props} />
              </div>
            );
          },
          th({ node, ...props }) {
            return <th className="border border-gray-300 px-4 py-2 bg-gray-100" {...props} />;
          },
          td({ node, ...props }) {
            return <td className="border border-gray-300 px-4 py-2" {...props} />;
          },
          a({ node, ...props }) {
            return <a className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />;
          },
          blockquote({ node, ...props }) {
            return <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600" {...props} />;
          },
          // 任务列表支持
          li({ node, className, checked, ...props }) {
            if (checked !== null && checked !== undefined) {
              return (
                <li className={`${className || ''} flex items-start`} {...props}>
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-1 mr-2"
                  />
                  <span>{props.children}</span>
                </li>
              );
            }
            return <li className={className} {...props} />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default PostContent;