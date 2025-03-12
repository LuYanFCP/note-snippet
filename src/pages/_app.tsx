import '@/app/globals.css';
import '@/styles/markdown.css'; 
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
