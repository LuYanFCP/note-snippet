# /// script
# dependencies = [
#   "requests",
#   "pytz"
# ]
# ///
import os
import re
import requests
import tomllib
import argparse
from datetime import datetime
import pytz

def fetch_github_readme(username, branch="main", token=None):
    """
    获取GitHub个人主页的README
    
    Args:
        username (str): GitHub用户名
        branch (str): 分支名称
        token (str, optional): GitHub API令牌
    
    Returns:
        str: README内容
    """
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    readme_url = f"https://raw.githubusercontent.com/{username}/{username}/refs/heads/{branch}/README.md"
    response = requests.get(readme_url, headers=headers)
    
    if response.status_code != 200:
        print(f"Error fetching README: {response.status_code}")
        return None
    
    return response.text

def fetch_issues_with_release_tag(owner, repo, token=None):
    """
    获取GitHub仓库中带有Release标签的issue
    
    Args:
        owner (str): 仓库所有者
        repo (str): 仓库名称
        token (str, optional): GitHub API令牌
    
    Returns:
        list: 包含Release标签的issue列表
    """
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    params = {
        "state": "all",
        "labels": "Release",
        "per_page": 100
    }
    
    all_issues = []
    page = 1
    
    while True:
        params["page"] = page
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"Error fetching issues: {response.status_code}")
            if response.headers.get('content-type') == 'application/json':
                print(response.json())
            break
        
        issues = response.json()
        if not issues:
            break
            
        all_issues.extend(issues)
        page += 1
    
    return all_issues

def fetch_repository_tags(owner, repo, token=None, exclude_tags=None):
    """
    获取GitHub仓库的标签（除了指定排除的标签）
    
    Args:
        owner (str): 仓库所有者
        repo (str): 仓库名称
        token (str, optional): GitHub API令牌
        exclude_tags (list, optional): 要排除的标签列表
    
    Returns:
        list: 标签列表
    """
    if exclude_tags is None:
        exclude_tags = ["Release"]
    
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    url = f"https://api.github.com/repos/{owner}/{repo}/tags"
    params = {"per_page": 100}
    
    all_tags = []
    page = 1
    
    while True:
        params["page"] = page
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"Error fetching tags: {response.status_code}")
            if response.headers.get('content-type') == 'application/json':
                print(response.json())
            break
        
        tags = response.json()
        if not tags:
            break
        
        # 过滤掉排除的标签
        filtered_tags = [tag for tag in tags if tag["name"] not in exclude_tags]
        all_tags.extend(filtered_tags)
        page += 1
    
    return all_tags

def convert_issue_to_markdown(issue, repo_owner, repo_name):
    """
    将issue内容转换为Markdown格式，包括标签
    
    Args:
        issue (dict): issue数据
        repo_owner (str): 仓库所有者
        repo_name (str): 仓库名称
    
    Returns:
        str: Markdown格式的内容
        str: 文件名
    """
    # 提取issue信息
    title = issue["title"]
    body = issue["body"] or ""
    number = issue["number"]
    created_at = datetime.strptime(issue["created_at"], "%Y-%m-%dT%H:%M:%SZ")
    author = issue["user"]["login"]
    
    # 提取标签
    labels = [label["name"] for label in issue.get("labels", [])]
    
    # 创建frontmatter
    frontmatter = f"""---
title: "{title}"
date: {created_at.strftime('%Y-%m-%d %H:%M:%S')}
author: {author}
issue_number: {number}
repo: "{repo_owner}/{repo_name}"
"""
    
    # 添加标签到frontmatter
    if labels:
        frontmatter += "tags:\n"
        for label in labels:
            frontmatter += f"    - {label}\n"
    
    frontmatter += "---\n\n"
    
    # 组合完整的Markdown内容
    markdown_content = frontmatter + body
    
    # 添加原始issue链接
    markdown_content += f"\n\n---\n\n[查看原始Issue](https://github.com/{repo_owner}/{repo_name}/issues/{number})"
    
    # 生成文件名 (使用issue编号和标题)
    # 移除非法字符，将空格替换为短横线
    safe_title = re.sub(r'[^\w\s-]', '', title).strip().lower()
    safe_title = re.sub(r'[-\s]+', '-', safe_title)
    filename = f"{repo_name}-{number}-{safe_title}.md"
    
    return markdown_content, filename

def convert_tag_to_markdown(tag, owner, repo, token=None):
    """
    将标签信息转换为Markdown格式
    
    Args:
        tag (dict): 标签数据
        owner (str): 仓库所有者
        repo (str): 仓库名称
        token (str, optional): GitHub API令牌
    
    Returns:
        str: Markdown格式的内容
        str: 文件名
    """
    # 提取标签信息
    tag_name = tag["name"]
    commit_sha = tag["commit"]["sha"]
    
    # 获取标签的提交信息
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    commit_url = f"https://api.github.com/repos/{owner}/{repo}/commits/{commit_sha}"
    response = requests.get(commit_url, headers=headers)
    commit_info = response.json() if response.status_code == 200 else {}
    
    # 提取提交日期和作者
    commit_date = datetime.now()
    commit_author = "Unknown"
    commit_message = ""
    
    if "commit" in commit_info:
        if "author" in commit_info["commit"] and commit_info["commit"]["author"]:
            commit_date_str = commit_info["commit"]["author"].get("date", "")
            if commit_date_str:
                commit_date = datetime.strptime(commit_date_str, "%Y-%m-%dT%H:%M:%SZ")
        
        if "author" in commit_info and commit_info["author"]:
            commit_author = commit_info["author"].get("login", "Unknown")
        
        commit_message = commit_info["commit"].get("message", "")
    
    # 创建frontmatter
    frontmatter = f"""---
title: "Tag: {tag_name}"
date: {commit_date.strftime('%Y-%m-%d %H:%M:%S')}
author: {commit_author}
tag_name: {tag_name}
commit_sha: {commit_sha}
repo: "{owner}/{repo}"
tags:
    - {tag_name}
    - git-tag
---

"""
    
    # 组合完整的Markdown内容
    markdown_content = frontmatter
    markdown_content += f"# {tag_name}\n\n"
    markdown_content += f"**仓库:** [{owner}/{repo}](https://github.com/{owner}/{repo})\n\n"
    markdown_content += f"**提交者:** {commit_author}\n\n"
    markdown_content += f"**提交日期:** {commit_date.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    markdown_content += f"**提交SHA:** [{commit_sha[:7]}](https://github.com/{owner}/{repo}/commit/{commit_sha})\n\n"
    
    if commit_message:
        markdown_content += "## 提交信息\n\n"
        markdown_content += f"```\n{commit_message}\n```\n\n"
    
    markdown_content += f"[查看GitHub上的标签](https://github.com/{owner}/{repo}/releases/tag/{tag_name})\n"
    
    # 生成文件名
    safe_tag_name = re.sub(r'[^\w\s-]', '', tag_name).strip().lower()
    safe_tag_name = re.sub(r'[-\s]+', '-', safe_tag_name)
    filename = f"{repo}-tag-{safe_tag_name}.md"
    
    return markdown_content, filename

def save_markdown_file(content, filename, output_dir):
    """
    保存Markdown文件
    
    Args:
        content (str): Markdown内容
        filename (str): 文件名
        output_dir (str): 输出目录
    """
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    # 保存文件
    file_path = os.path.join(output_dir, filename)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Saved: {file_path}")

def save_readme_to_file(readme_content, output_path, title="首页"):
    """
    将README内容保存到指定文件
    
    Args:
        readme_content (str): README内容
        output_path (str): 输出文件路径
        title (str): 页面标题
    """
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)
    
    # 生成当前时间戳（ISO 8601格式）
    now = datetime.now(pytz.timezone('Asia/Shanghai')).strftime("%Y-%m-%dT%H:%M:%S%z")
    
    # 创建前置元数据
    front_matter = f"""---
title: "{title}"
date: {now}
lastmod: {now}
draft: false
---

"""
    
    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(front_matter)
        f.write(readme_content)
    
    print(f"Saved README to: {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Fetch GitHub content and convert to Hugo Markdown')
    parser.add_argument('--config', default='hugo.toml', help='Hugo config file path')
    parser.add_argument('--token', help='GitHub API token')
    parser.add_argument('--skip-readme', action='store_true', help='Skip fetching README')
    parser.add_argument('--skip-releases', action='store_true', help='Skip fetching Release issues')
    parser.add_argument('--skip-tags', action='store_true', help='Skip fetching tags')
    
    args = parser.parse_args()
    
    # 读取Hugo配置文件
    try:
        with open(args.config, 'rb') as f:
            config = tomllib.load(f)
    except FileNotFoundError:
        print(f"错误：找不到{args.config}文件")
        return
    except Exception as e:
        print(f"读取配置文件时出错: {e}")
        return
    
    # 获取GitHub配置
    github_config = config.get('params', {}).get('github', {})
    enabled = github_config.get('enabled', False)
    username = github_config.get('username', '')
    branch = github_config.get('branch', 'main')
    token = args.token or github_config.get('token', None)
    
    # 检查是否启用
    if not enabled:
        print("GitHub同步未启用，退出脚本")
        return
    
    # 检查用户名
    if not username:
        print("未找到GitHub用户名，请在配置中设置params.github.username")
        return
    
    # 1. 获取并保存README
    if not args.skip_readme and github_config.get('readme_to_index', False):
        readme_path = github_config.get('readme_path', 'content/about/_index.md')
        readme_title = github_config.get('readme_title', '关于我')
        
        print(f"正在从GitHub获取{username}的个人README...")
        readme_content = fetch_github_readme(username, branch, token)
        if readme_content:
            save_readme_to_file(readme_content, readme_path, readme_title)
    
    # 2. 获取并保存Release标签的issue
    if not args.skip_releases:
        releases_dir = github_config.get('releases_dir', 'content/releases')
        
        # 获取issue仓库配置
        issue_repos = github_config.get('issue_repos', [])
        
        # 如果没有配置issue_repos，则使用默认仓库（用户名）
        if not issue_repos:
            default_repo = github_config.get('repo', username)
            issue_repos = [{"owner": username, "repo": default_repo}]
        
        for repo_config in issue_repos:
            repo_owner = repo_config.get('owner', username)
            repo_name = repo_config.get('repo')
            
            if not repo_name:
                print(f"跳过未指定仓库名的配置项")
                continue
                
            print(f"正在从GitHub获取{repo_owner}/{repo_name}的Release标签issue...")
            issues = fetch_issues_with_release_tag(repo_owner, repo_name, token)
            print(f"找到{len(issues)}个带有Release标签的issue")
            
            # 转换并保存每个issue
            for issue in issues:
                markdown_content, filename = convert_issue_to_markdown(issue, repo_owner, repo_name)
                save_markdown_file(markdown_content, filename, releases_dir)
    
    # 3. 获取并保存标签（除Release外）
    if not args.skip_tags:
        tags_dir = github_config.get('tags_dir', 'content/tags')
        exclude_tags = github_config.get('exclude_tags', ['Release'])
        
        # 获取标签仓库配置
        tag_repos = github_config.get('tag_repos', [])
        
        # 如果没有配置tag_repos，则使用默认仓库（用户名）
        if not tag_repos:
            default_repo = github_config.get('repo', username)
            tag_repos = [{"owner": username, "repo": default_repo}]
        
        for repo_config in tag_repos:
            repo_owner = repo_config.get('owner', username)
            repo_name = repo_config.get('repo')
            
            if not repo_name:
                print(f"跳过未指定仓库名的配置项")
                continue
                
            print(f"正在从GitHub获取{repo_owner}/{repo_name}的标签...")
            tags = fetch_repository_tags(repo_owner, repo_name, token, exclude_tags)
            print(f"找到{len(tags)}个标签（不包括排除的标签）")
            
            # 转换并保存每个标签
            for tag in tags:
                markdown_content, filename = convert_tag_to_markdown(tag, repo_owner, repo_name, token)
                save_markdown_file(markdown_content, filename, tags_dir)

if __name__ == "__main__":
    main()