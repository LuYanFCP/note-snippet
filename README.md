# Issue Blog

基于 GitHub Issues 的静态博客系统。

## 文章发布规则

本博客使用 GitHub Issues 作为内容源，并具有以下特点：

- **仅显示标记为已发布的文章**：只有添加了 `Release` 标签的 Issues 才会显示在博客中。
- **其他标签**：可以添加其他标签来对文章进行分类，这些标签会显示在文章页面并可用于过滤。
- **草稿功能**：不添加 `Release` 标签的 Issues 相当于是草稿状态，不会显示在博客中。

## 如何使用

1. 在 GitHub 仓库中创建一个新的 Issue
2. 使用 Markdown 编写文章内容
3. 添加 `Release` 标签以将文章标记为已发布
4. 添加其他标签以对文章进行分类
5. 重新构建博客以更新内容

## 技术栈

- Next.js
- React
- TypeScript
- Tailwind CSS

# GitHub Issues Blog

This project is a blog application that uses GitHub Issues as a backend for storing blog posts. It is built with React, Vite, ShadcnUI, and Next.js, providing a modern and responsive user experience.

## Features

- Fetches blog posts from GitHub Issues.
- Displays a list of posts with summaries.
- Allows users to view full content of each post.
- Responsive design with a clean user interface.

## Getting Started

To get started with the project, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/github-issues-blog.git
   cd github-issues-blog
   ```

2. **Install dependencies:**

   Make sure you have Node.js installed. Then run:

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env.local` file in the root of the project and add your GitHub personal access token:

   ```
   GITHUB_TOKEN=your_github_token
   ```

4. **Run the development server:**

   Start the development server with:

   ```bash
   npm run dev
   ```

   Open your browser and navigate to `http://localhost:3000` to see the application in action.

## Folder Structure

- `src/app`: Contains the main application pages and routing.
- `src/components`: Contains reusable UI components.
- `src/lib`: Contains utility functions and API interaction logic.
- `src/types`: Contains TypeScript types and interfaces.
- `public`: Contains static assets like images and icons.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.