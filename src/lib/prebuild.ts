const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GITHUB_API_URL = 'https://api.github.com';
const REPO_OWNER = process.env.REPO_OWNER || 'luyanfcp';
const REPO_NAME = process.env.REPO_NAME || 'note-snippet';
// 配置GitHub用户名 - 用于获取个人信息和README
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || REPO_OWNER;
const DATA_DIR = path.join(process.cwd(), 'src', 'data');

// 用于标记应该发布的文章的标签名
const RELEASE_TAG = "Release";

/**
 * 获取GitHub API请求配置
 */
function getRequestConfig() {
  const config = {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  };
  
  if (process.env.GITHUB_TOKEN) {
    config.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    console.log('使用GitHub Token进行API请求');
  }
  
  return config;
}

/**
 * 获取所有GitHub Issues
 */
async function fetchAllIssues() {
  try {
    console.log(`📥 正在从 ${REPO_OWNER}/${REPO_NAME} 获取issues...`);
    
    const config = getRequestConfig();
    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&per_page=100`,
      config
    );
    
    if (response.status !== 200) {
      throw new Error(`获取Issues失败: ${response.statusText}`);
    }
    
    const issues = response.data;
    console.log(`✅ 成功获取 ${issues.length} 篇文章`);
    
    return issues.map((issue) => ({
      id: issue.number,
      title: issue.title,
      body: issue.body,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      labels: issue.labels,
      user: {
        login: issue.user.login,
        avatar_url: issue.user.avatar_url
      }
    }));
  } catch (error) {
    console.error('❌ 获取Issues失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    return [];
  }
}

/**
 * 获取GitHub用户信息
 */
async function fetchGithubUser() {
  try {
    console.log(`📥 正在获取 ${GITHUB_USERNAME} 的用户信息...`);
    
    const config = getRequestConfig();
    const response = await axios.get(
      `${GITHUB_API_URL}/users/${GITHUB_USERNAME}`,
      config
    );
    
    if (response.status !== 200) {
      throw new Error(`获取用户信息失败: ${response.statusText}`);
    }
    
    console.log(`✅ 成功获取 ${GITHUB_USERNAME} 的用户信息`);
    return response.data;
  } catch (error) {
    console.error('❌ 获取用户信息失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    
    // 返回默认用户信息
    return {
      login: GITHUB_USERNAME,
      name: GITHUB_USERNAME,
      avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      html_url: `https://github.com/${GITHUB_USERNAME}`,
      bio: '',
      blog: '',
      location: '',
      company: '',
      twitter_username: '',
      public_repos: 0,
      followers: 0,
      following: 0
    };
  }
}

/**
 * 获取用户的README内容
 */
async function fetchUserReadme() {
  try {
    console.log(`📥 正在获取 ${GITHUB_USERNAME} 的README内容...`);
    
    const config = getRequestConfig();
    // GitHub用户README通常在用户同名仓库的README.md文件中
    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${GITHUB_USERNAME}/${GITHUB_USERNAME}/readme`,
      config
    );
    
    if (response.status !== 200) {
      throw new Error(`获取README失败: ${response.statusText}`);
    }
    
    // GitHub API返回的内容是Base64编码的
    const readme = Buffer.from(response.data.content, 'base64').toString('utf-8');
    console.log(`✅ 成功获取 ${GITHUB_USERNAME} 的README内容`);
    return readme;
  } catch (error) {
    console.error('❌ 获取README内容失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    return '# 关于我\n暂无个人介绍信息。';
  }
}

/**
 * 保存用户信息和README内容
 */
async function saveUserInfo() {
  try {
    // 获取用户信息和README
    const [user, readme] = await Promise.all([
      fetchGithubUser(),
      fetchUserReadme()
    ]);
    
    // 创建用户信息对象
    const userInfo = {
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      bio: user.bio || '',
      blog: user.blog || '',
      location: user.location || '',
      company: user.company || '',
      twitter_username: user.twitter_username || '',
      public_repos: user.public_repos || 0,
      followers: user.followers || 0,
      following: user.following || 0,
      readme_content: readme
    };
    
    // 保存用户信息到文件
    fs.writeFileSync(
      path.join(DATA_DIR, 'user-info.json'),
      JSON.stringify(userInfo, null, 2)
    );
    
    console.log(`📊 用户信息和README已保存到 user-info.json`);
    return userInfo;
  } catch (error) {
    console.error('❌ 保存用户信息失败:', error);
    
    // 创建默认用户信息
    const defaultUserInfo = {
      login: GITHUB_USERNAME,
      name: GITHUB_USERNAME,
      avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      html_url: `https://github.com/${GITHUB_USERNAME}`,
      bio: '',
      blog: '',
      location: '',
      company: '',
      twitter_username: '',
      public_repos: 0,
      followers: 0,
      following: 0,
      readme_content: '# 关于我\n暂无个人介绍信息。'
    };
    
    // 保存默认用户信息到文件
    fs.writeFileSync(
      path.join(DATA_DIR, 'user-info.json'),
      JSON.stringify(defaultUserInfo, null, 2)
    );
    
    console.log(`⚠️ 已创建默认用户信息文件 user-info.json`);
    return defaultUserInfo;
  }
}

/**
 * 保存所有文章内容到一个完整的数据文件
 */
async function savePrebuildData() {
  try {
    // 确保数据目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // 获取所有文章
    const allIssues = await fetchAllIssues();
    
    if (allIssues.length === 0) {
      console.warn('⚠️ 没有获取到任何文章');
      
      // 创建空的数据文件，以确保构建不会失败
      fs.writeFileSync(path.join(DATA_DIR, 'all-content.json'), JSON.stringify([], null, 2));
      fs.writeFileSync(path.join(DATA_DIR, 'posts.json'), JSON.stringify([], null, 2));
      fs.writeFileSync(path.join(DATA_DIR, 'tags.json'), JSON.stringify([], null, 2));
    } else {
      console.log(`📊 共获取到 ${allIssues.length} 篇文章`);
      
      // 过滤出有Release标签的文章
      const posts = allIssues.filter(post => 
        post.labels?.some(label => label.name === RELEASE_TAG)
      );
      
      console.log(`📊 其中 ${posts.length} 篇文章标记为已发布 (含有"${RELEASE_TAG}"标签)`);
      
      // 提取所有标签并计数，但只从已发布的文章中提取
      const tagsMap = new Map();
      posts.forEach(post => {
        post.labels?.forEach(label => {
          // 排除Release标签本身
          if (label.name !== RELEASE_TAG) {
            const name = label.name.toLowerCase();
            tagsMap.set(name, (tagsMap.get(name) || 0) + 1);
          }
        });
      });
      
      const tags = Array.from(tagsMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      
      // 准备每篇文章的摘要信息，只为已发布的文章准备
      const postsWithExcerpts = posts.map(post => {
        // 计算摘要
        const excerpt = post.body ? 
          post.body.substring(0, 200).replace(/[#*`]/g, '').trim() + '...' : 
          '';
        
        return {
          id: post.id,
          title: post.title,
          excerpt: excerpt,
          created_at: post.created_at,
          updated_at: post.updated_at,
          labels: post.labels,
          user: post.user
        };
      });
      
      // 保存所有文章内容，包括未发布的（all-content.json 保留所有文章方便管理）
      fs.writeFileSync(
        path.join(DATA_DIR, 'all-content.json'),
        JSON.stringify(allIssues, null, 2)
      );
      
      // 只保存已发布文章的摘要列表
      fs.writeFileSync(
        path.join(DATA_DIR, 'posts.json'),
        JSON.stringify(postsWithExcerpts, null, 2)
      );
      
      // 只保存已发布文章的标签
      fs.writeFileSync(
        path.join(DATA_DIR, 'tags.json'),
        JSON.stringify(tags, null, 2)
      );
      
      console.log(`📊 预构建数据已保存:`);
      console.log(`  - ${allIssues.length} 篇文章的完整内容已保存到 all-content.json`);
      console.log(`  - ${postsWithExcerpts.length} 篇已发布文章的摘要信息已保存到 posts.json`);
      console.log(`  - ${tags.length} 个标签信息已保存到 tags.json`);
    }
    
    // 获取并保存用户信息
    await saveUserInfo();
    
    console.log('✨ 所有数据预构建完成');
  } catch (error) {
    console.error('❌ 预构建数据保存失败:', error);
    throw error;
  }
}

// 如果直接执行此文件，则执行预构建
if (require.main === module) {
  savePrebuildData()
    .then(() => console.log('✨ 预构建成功完成'))
    .catch(err => {
      console.error('❌ 预构建失败:', err);
      process.exit(1);
    });
}

// Export functions for use in other files
module.exports = {
  fetchAllIssues,
  fetchGithubUser,
  fetchUserReadme,
  saveUserInfo,
  savePrebuildData
};
