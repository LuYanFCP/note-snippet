# /// script
# dependencies = [
#   "requests",
# ]
# ///
"""掩码/分块的无损往返测试 —— 改 translate_issue.py 的掩码规则前后都要跑。

做的事：对每篇 Release issue 走一遍 mask → chunk → localize → restore，
但跳过「调模型」那一步，然后把结果和原文逐行比对。

能跑通就说明：占位符没有嵌套、没有被贪婪正则吞掉、编号在块内自洽。
跑不通说明掩码规则有洞 —— 这种洞一旦带到线上，坏掉的是公式和代码块。

    uv run test_roundtrip.py
"""

import difflib
import os
import re
import sys
import tomllib

from translate_issue import (
    Masker,
    fetch_release_issues,
    localize,
    split_chunks,
    strip_frontmatter,
)


def normalize(text: str) -> str:
    """只容忍空行数量和行尾空格的差异，其余必须逐字一致。"""
    text = re.sub(r"[ \t]+$", "", text, flags=re.M)
    return re.sub(r"\n{2,}", "\n\n", text).strip()


def main() -> int:
    with open("hugo.toml", "rb") as f:
        gh_conf = tomllib.load(f)["params"]["githubSync"]
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

    failed = 0
    for repo_conf in gh_conf.get("issue_repos", []):
        owner, repo = repo_conf["owner"], repo_conf["repo"]
        for issue in fetch_release_issues(owner, repo, token):
            if issue.get("pull_request"):
                continue
            number = issue["number"]
            body = strip_frontmatter(issue.get("body") or "")

            masker = Masker()
            chunks = split_chunks(masker.mask(body))

            parts = []
            for chunk in chunks:
                text, values = localize(chunk, masker)
                parts.append(masker.restore(text, values))   # 真实流程里这里夹着一次模型调用
            restored = "\n\n".join(parts)

            expected, actual = normalize(body), normalize(restored)
            if expected == actual:
                print(f"  #{number:>3}  OK    {len(chunks):>3} 块  {len(masker.values):>3} 占位符")
                continue

            failed += 1
            print(f"  #{number:>3}  还原后与原文不一致：")
            diff = difflib.unified_diff(
                expected.split("\n"), actual.split("\n"), lineterm="", n=1
            )
            for line in list(diff)[:30]:
                print("      " + line)

    print("\n全部无损还原" if not failed else f"\n{failed} 篇不一致")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
