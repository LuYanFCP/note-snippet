import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
// 导入Markdown样式
import '../styles/markdown.css';

// 定义类型
interface MermaidDiagramProps {
  chart: string;
}

interface MarkdownRendererProps {
  content: string;
}

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  node?: any;
  src: string;
  alt?: string;
}

interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
  [key: string]: any;
}

// 初始化Mermaid配置
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'sans-serif',
  fontSize: 14,
  flowchart: {
    htmlLabels: true,
    curve: 'linear'
  }
});

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderChart = async (): Promise<void> => {
      if (!chart) return;
      
      try {
        // 使用mermaid API渲染图表
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, chart);
        setSvg(svg);
        setError(null);
      } catch (err: any) {
        console.error('Mermaid rendering failed:', err);
        setError(`图表渲染失败: ${err.message}`);
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return <div className="mermaid-error">{error}</div>;
  }

  if (svg) {
    return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  return <div ref={ref} className="mermaid-loading">加载图表中...</div>;
};

// 处理GitHub Issue中的图片URL
const processGithubImageUrl = (url: string): string => {
  // 支持GitHub issue中常见的图片格式
  if (url.includes('user-images.githubusercontent.com') || 
      url.includes('github.com') && (url.includes('/issues/') || url.includes('/pull/'))) {
    // 如果是GitHub图片，确保获取完整分辨率
    return url;
  }
  return url;
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }: CodeProps) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (language === 'mermaid') {
              return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
            }
            
            return !inline && match ? (
              <div className="code-block-container">
                <SyntaxHighlighter
                  style={tomorrow}
                  language={language}
                  PreTag="div"
                  data-language={language} // 添加这个属性以支持语言标签
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          img({ node, ...props }: ImageProps) {
            // 处理图片，支持GitHub Issue中的图片
            const src = processGithubImageUrl(props.src);
            return (
              <span className="image-container">
                <img 
                  {...props} 
                  src={src} 
                  alt={props.alt || ''}
                  loading="lazy"
                  className="markdown-image" 
                />
                {props.alt && <span className="image-caption">{props.alt}</span>}
              </span>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
