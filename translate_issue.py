# /// script
# dependencies = [
#   "requests",
# ]
# ///
"""
把带 Release 标签的 issue 正文翻译成英文，产物落在 translations/ 下。

设计要点（详见 README 或 PR 描述）：

  掩码 → 分块 → 块级缓存 → 调用 LLM → 占位符校验 → 还原

1. 掩码：代码块、数学公式、图片、链接 URL、脚注标记在送进模型前先换成
   `[[M0]]` 这样的占位符。既防止模型改坏 KaTeX / 代码，也省 token。
2. 分块：按标题切，长段再按空行累到 ~1800 字。一次只翻一块，避免输出被
   模型的 max_tokens 截断。
3. 块级缓存：缓存 key 是「本块掩码后文本」的 sha256，所以改一段只重翻一段，
   而且改图片路径、改链接不会触发重翻（路径在占位符里，不进 key）。
   占位符在每块内部从 0 重新编号，否则在文章开头插一张图会让后面所有块的
   key 全变，缓存整体失效。
4. 校验：译文里的占位符集合必须和原文完全一致，否则重试；再失败就该块回退
   原文。宁可漏译，不能把公式或代码译坏。

用法：
    export DEEPSEEK_API_KEY=sk-xxx
    uv run translate_issue.py --issue 20 --dry-run      # 翻译但不落盘，打到 stdout
    uv run translate_issue.py --issue 20 --plan         # 不调 API，只看分块和成本预估
    uv run translate_issue.py --all                     # 全量，写 i18n/
"""

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import sys
import time
import tomllib
from datetime import datetime, timezone

import requests

# 缓存格式版本。改了掩码规则或 prompt 就 +1，老缓存自然失效。
CACHE_VERSION = 1

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
MAX_CHUNK_CHARS = 1800

PLACEHOLDER_RE = re.compile(r"\[\[M(\d+)\]\]")
CJK_RE = re.compile(r"[一-鿿㐀-䶿]")


# ----------------------------------------------------------------------
# 掩码
# ----------------------------------------------------------------------

class Masker:
    """把不该翻译的片段换成 [[Mn]]，并能还原回去。"""

    def __init__(self):
        self.values: list[str] = []

    def _take(self, text: str) -> str:
        # 后一条规则可能把前一条产生的占位符整个圈进来（比如行内代码里含 `<host>`）。
        # 存进去之前先展开，values 里永远是完全还原的原文，不存在嵌套。
        self.values.append(self.restore(text))
        return f"[[M{len(self.values) - 1}]]"

    def mask(self, md: str) -> str:
        md = md.replace("\r\n", "\n")
        md = self._mask_fences(md)

        # 顺序有讲究：块级的先于行内的，长的先于短的。
        rules = [
            r"<!--.*?-->",                      # HTML 注释
            r"\$\$.*?\$\$",                     # 块级公式 $$...$$
            r"\\\[.*?\\\]",                     # 块级公式 \[...\]
            r"!\[[^\]]*\]\([^)]*\)",            # 图片整体（alt 多是文件名，不值得翻）
            r"\\\(.*?\\\)",                     # 行内公式 \(...\)
            r"`{1,3}[^`\n]+`{1,3}",             # 行内代码（必须早于 HTML 标签：`a<<<b>>>` 里的尖括号不是标签）
            r"<[a-zA-Z/][^>\n]*>",              # HTML 标签本体（标签间的文字仍可翻）
            r"\[\^[^\]\s]+\]",                  # 脚注标记 [^1]
        ]
        for pattern in rules:
            md = re.sub(pattern, lambda m: self._take(m.group(0)), md, flags=re.DOTALL)

        # 行内公式 $...$：限定不跨行、内部无 $，避免把两段公式之间的中文一起吞掉。
        md = re.sub(r"\$[^$\n]+\$", lambda m: self._take(m.group(0)), md)

        # 链接只掩 URL，锚文本留给模型翻。
        md = re.sub(
            r"(?<=\])\((?!\s)[^)\s]+(?:\s+\"[^\"]*\")?\)",
            lambda m: self._take(m.group(0)),
            md,
        )
        # 裸 URL
        md = re.sub(r"https?://[^\s<>\[\]()]+", lambda m: self._take(m.group(0)), md)
        return md

    def _mask_fences(self, md: str) -> str:
        """围栏代码块按行扫描，比正则稳：内容里可能有落单的反引号。"""
        out: list[str] = []
        buf: list[str] = []
        fence = ""
        for line in md.split("\n"):
            if fence:
                buf.append(line)
                if line.strip().startswith(fence):
                    out.append(self._take("\n".join(buf)))
                    buf, fence = [], ""
                continue
            m = re.match(r"\s*(`{3,}|~{3,})", line)
            if m:
                fence = m.group(1)
                buf = [line]
            else:
                out.append(line)
        if buf:  # 没闭合的围栏，原样留着
            out.append("\n".join(buf))
        return "\n".join(out)

    def restore(self, text: str, local_values: list[str] | None = None) -> str:
        values = self.values if local_values is None else local_values

        def sub(m: re.Match) -> str:
            idx = int(m.group(1))
            return values[idx] if idx < len(values) else m.group(0)

        return PLACEHOLDER_RE.sub(sub, text)


def localize(chunk: str, masker: Masker) -> tuple[str, list[str]]:
    """把块内占位符重新从 0 编号，返回 (新文本, 该块的还原表)。

    这是缓存能稳定命中的关键：编号只跟块内部有关，和文章别处的改动无关。
    """
    local: list[str] = []
    mapping: dict[str, str] = {}

    def sub(m: re.Match) -> str:
        gid = m.group(1)
        if gid not in mapping:
            mapping[gid] = f"[[M{len(local)}]]"
            local.append(masker.values[int(gid)])
        return mapping[gid]

    return PLACEHOLDER_RE.sub(sub, chunk), local



# ----------------------------------------------------------------------
# 代码块与 mermaid 图里的中文
#
# 这里刻意不让模型看见、更不让它重写整个代码块或图 —— 那样一个标点就能
# 让图渲染不出来、让代码变成错的。改成：Python 按 span 抽出「含中文的文本
# 片段」，只把这些片段交给模型翻，再按原 span 拼回去。结构由 Python 保证，
# 模型碰不到，所以结构性破坏在物理上不会发生。
# ----------------------------------------------------------------------

# 片段边界：遇到任何结构性字符就断开。mermaid 的箭头（-->、->>）、方括号、
# 竖线、冒号，以及代码里的括号引号运算符，都不会被卷进片段里。
PHRASE_RE = re.compile(
    r'[^\n\[\]{}()<>|:;"\'`=+\-*/\\]*'
    r'[\u4e00-\u9fff]'
    r'[^\n\[\]{}()<>|:;"\'`=+\-*/\\]*'
)

# 注释标记按语言区分。用一条通用正则是不行的：JSON 里 `"url": "https://..."`
# 的 // 会被当成注释起点，于是后半行的字符串字面量被当成注释翻掉 —— 数据就被改了。
_HASH = {"python", "py", "ruby", "rb", "sh", "bash", "zsh", "shell", "console",
         "yaml", "yml", "toml", "ini", "conf", "perl", "r", "makefile", "dockerfile"}
_SLASH = {"c", "cpp", "c++", "cc", "cu", "cuda", "h", "hpp", "java", "js", "jsx",
          "javascript", "ts", "tsx", "typescript", "go", "golang", "rust", "rs",
          "swift", "kotlin", "kt", "scala", "cs", "csharp", "php", "proto", "dart"}
_DASH = {"sql", "lua", "haskell", "hs"}
# 这些语言压根没有注释语法，一个字符都不该动
_NO_COMMENT = {"json", "jsonc", "csv", "tsv", "text", "txt", "plain", "plaintext",
               "log", "output", "diff", "patch", "md", "markdown", "html", "xml"}


def comment_markers(kind: str) -> tuple[re.Pattern | None, bool, bool]:
    """返回 (行注释正则, 是否有 /* */, 是否有 docstring)。"""
    if kind in _NO_COMMENT:
        return None, False, False

    markers = []
    if kind in _HASH or kind not in _SLASH | _DASH:
        markers.append("#")
    if kind in _SLASH or kind not in _HASH | _DASH:
        markers.append("(?<!:)//")          # 不把 https:// 当注释
    if kind in _DASH:
        markers.append("--")

    pattern = re.compile("(" + "|".join(markers) + ")") if markers else None
    return pattern, kind not in _HASH, kind in {"python", "py"}


def comment_spans(code: str, kind: str = "") -> list[tuple[int, int]]:
    """代码里「可以动」的区域：行注释、块注释、docstring。

    只在这些区域里找中文，所以字符串字面量、标识符一律不碰 ——
    翻译注释不该改变代码的行为，哪怕只是示例代码。

    一律按行切，不跨行返回：下游会整段送给模型，跨行的话模型很容易
    把换行数改掉，代码的行结构就散了。
    """
    line_re, has_block, has_doc = comment_markers(kind)
    if line_re is None and not has_block and not has_doc:
        return []

    spans: list[tuple[int, int]] = []
    pos = 0
    in_block = ""        # 块注释结束符 */，或 docstring 的 """ / \'\'\'

    for line in code.split("\n"):
        end = pos + len(line)

        if in_block:
            close = line.find(in_block)
            if close == -1:
                spans.append((pos, end))
            else:
                spans.append((pos, pos + close))
                in_block = ""
            pos = end + 1
            continue

        openers = ([r'/\*'] if has_block else []) + ([r'"""', r"\'\'\'"] if has_doc else [])
        m = re.search("|".join(openers), line) if openers else None
        if m:
            closer = "*/" if m.group(0) == "/*" else m.group(0)
            rest_at = m.end()
            closing = line.find(closer, rest_at)
            if closing != -1:
                spans.append((pos + rest_at, pos + closing))
            else:
                in_block = closer
                spans.append((pos + rest_at, end))
            pos = end + 1
            continue

        m = line_re.search(line) if line_re else None
        if m:
            spans.append((pos + m.end(), end))
        pos = end + 1

    return spans


CODE_SHAPE_RE = re.compile(
    r'[;{}]\s*$|^\s*(?:def|class|import|from|#include|func|var|let|const|public|private|'
    r'return|if|for|while)\b',
    re.M,
)


def looks_like_prose(body: str) -> bool:
    """没标语言的围栏块，到底是代码还是「拿等宽字体画的说明图」。

    博客里常有这种块：几行中文配几个箭头，用来解释地址怎么变。它是写给人读的，
    该翻；但同样没标语言的真代码不能动，所以用「有没有代码的形状」来区分。
    """
    return not CODE_SHAPE_RE.search(body)


def cjk_spans(block: str, kind: str) -> list[tuple[int, int]]:
    """返回块内需要翻译的片段位置（相对整块，含围栏行的偏移）。

    图的语法里箭头、括号、竖线都是结构，所以按 PHRASE_RE 把标签切成片段
    再交出去；注释是自由文本，整段送反而让模型看到完整句子，译得更顺。
    两种情况都跳过围栏行本身。
    """
    lines = block.split("\n")
    body_start = len(lines[0]) + 1
    body_end = len(block) - (len(lines[-1]) + 1 if len(lines) > 1 else 0)
    body = block[body_start:body_end]

    if kind == "mermaid":
        regions, fragment = mermaid_regions(body), True
    elif kind == "infographic":
        regions, fragment = infographic_regions(body), True
    elif kind == "code" and looks_like_prose(body):
        # 没标语言、又不像代码：整块都是给人看的文字，按行全译
        regions, fragment = [(m.start(), m.end()) for m in re.finditer(r'^.*$', body, re.M)], False
    else:
        regions, fragment = comment_spans(body, kind), False

    spans: list[tuple[int, int]] = []

    def emit(start: int, text: str) -> None:
        stripped = text.strip()
        if not stripped:
            return
        # 两端空白排除在 span 外，免得译文把缩进吃掉
        lead = len(text) - len(text.lstrip())
        spans.append((body_start + start + lead,
                      body_start + start + lead + len(stripped)))

    for lo, hi in regions:
        if fragment:
            for m in PHRASE_RE.finditer(body, lo, hi):
                emit(m.start(), m.group(0))
        elif CJK_RE.search(body[lo:hi]):
            emit(lo, body[lo:hi])
    return spans


def mermaid_regions(body: str) -> list[tuple[int, int]]:
    """mermaid 里「只是给人看的文字」的位置。

    逐行收窄：`participant Client as Git MCP 客户端` 只交出 `as` 后面那段，
    `%% 注释` 只交出 %% 后面那段。否则模型可能顺手把关键字 participant、
    连接词 as、或者节点 id Client 一起改了 —— id 一变，边就连错了。
    """
    regions = []
    pos = 0
    for line in body.split("\n"):
        start, end = pos, pos + len(line)
        m = re.match(r'\s*%%+', line)
        if m:
            start = pos + m.end()
        else:
            m = re.search(r'\b(?:as|AS)\s+', line)
            if m and re.match(r'\s*(?:participant|actor|class|state)\b', line):
                start = pos + m.end()
        regions.append((start, end))
        pos = end + 1
    return regions


def infographic_regions(body: str) -> list[tuple[int, int]]:
    """AntV infographic DSL 里「给人看的文字」的位置。

    语法是缩进敏感的 `key value`（title / desc / label / children …），
    所以只交出 key 后面那段 —— 缩进和 key 必须一个字符都不动，
    否则整张图的层级就塌了。
    """
    regions = []
    pos = 0
    for line in body.split("\n"):
        m = re.match(r'(\s*(?:-\s+)?)([A-Za-z][\w-]*)\s+(?=\S)', line)
        if m:
            regions.append((pos + m.end(), pos + len(line)))
        pos += len(line) + 1
    return regions


def fence_kind(block: str) -> str:
    r"""围栏的语言标注。没标注就返回 "code"。

    注意这里只能用 [ \t]*，不能用 \s* —— \s 会跨过换行，
    于是裸 ``` 块会把下一行的第一个词当成语言名。
    """
    m = re.match(r'[ \t]*(?:`{3,}|~{3,})[ \t]*([\w+#-]*)', block)
    return (m.group(1) or "code").lower() if m else "code"


def translate_fenced_blocks(masker: Masker, translator, args, glossary_fp: str,
                            cache: dict) -> int:
    """就地翻译 masker 里所有含中文的围栏块，返回实际调用模型的次数。"""
    targets = []
    for idx, val in enumerate(masker.values):
        if not re.match(r'\s*(?:`{3,}|~{3,})', val) or not CJK_RE.search(val):
            continue
        kind = fence_kind(val)
        spans = cjk_spans(val, kind)
        if not spans:
            continue
        # 抽出的片段本身进 key：哪天改了抽取规则，受影响的块会自动失效重翻，
        # 不用手动记得去 bump 版本号
        key = sha(f"fenced\n{kind}\n{glossary_fp}\n{val}\n"
                  + json.dumps([val[a:b] for a, b in spans], ensure_ascii=False))
        if key in cache:
            masker.values[idx] = cache[key]
            continue
        targets.append((idx, kind, val, key, spans))

    if not targets:
        return 0

    def work(item):
        idx, kind, val, key, spans = item
        return idx, key, translator.translate_fenced(val, kind, spans)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        for idx, key, translated in pool.map(work, targets):
            cache[key] = translated
            masker.values[idx] = translated

    return len(targets)


# ----------------------------------------------------------------------
# 分块
# ----------------------------------------------------------------------

def split_chunks(md: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """按空行切块，再攒成不超过 max_chars 的分组；标题强制另起一组。"""
    blocks = [b for b in re.split(r"\n\s*\n", md) if b.strip()]
    chunks: list[str] = []
    cur: list[str] = []
    size = 0

    for block in blocks:
        is_heading = bool(re.match(r"\s*#{1,6}\s", block))
        if cur and (is_heading or size + len(block) > max_chars):
            chunks.append("\n\n".join(cur))
            cur, size = [], 0
        cur.append(block)
        size += len(block) + 2

    if cur:
        chunks.append("\n\n".join(cur))
    return chunks


def needs_translation(chunk: str) -> bool:
    """没有中日韩字符就不用翻：纯代码块、纯图片、论文英文引用都走这条路，不花钱。"""
    return bool(CJK_RE.search(chunk))


# ----------------------------------------------------------------------
# LLM
# ----------------------------------------------------------------------

SYSTEM_PROMPT = """You are a professional technical translator. You translate Chinese \
engineering blog posts about machine learning systems, GPU/AI infrastructure and \
algorithms into English.

Rules, in priority order:

1. Output ONLY the translated Markdown fragment. No preamble, no closing remark, no \
explanation, and do not wrap your answer in a code fence.
2. Preserve the Markdown structure exactly: heading levels and their section numbers, \
list markers and indentation, blockquote `>` prefixes, emphasis markers, table pipes, \
and the blank lines between blocks.
3. Tokens that look like [[M0]], [[M1]] are placeholders standing in for code, math, \
images, URLs and footnote markers. Reproduce every one of them verbatim, the same \
number of times, in the same relative position. Never translate, renumber, merge, \
split or drop a placeholder, and never invent a new one.
4. Text that is already English — typically quotations from papers — must be copied \
verbatim. Do not paraphrase it and do not translate it back and forth.
5. Keep established technical terms in English (attention, KV cache, softmax, kernel, \
throughput, ...). Never coin coinages that no English-speaking engineer would use.
6. Write like an English engineering blog: direct, precise, active voice. Do not pad, \
do not summarise, do not add explanations the author did not write, and do not drop \
anything the author did write.
7. Keep the author's first-person voice and informal asides intact."""


def build_system_prompt(glossary: dict[str, str]) -> str:
    if not glossary:
        return SYSTEM_PROMPT
    lines = "\n".join(f"  {zh} -> {en}" for zh, en in glossary.items())
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Glossary. When the Chinese on the left appears, render it exactly as the "
        f"English on the right:\n{lines}"
    )


class Translator:
    def __init__(self, api_key, base_url, model, temperature, system_prompt, timeout=180):
        self.api_key = api_key
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model = model
        self.temperature = temperature
        self.system_prompt = system_prompt
        self.timeout = timeout
        self.prompt_tokens = 0
        self.completion_tokens = 0

    def _call(self, user_prompt: str, system: str | None = None) -> str:
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "stream": False,
            "messages": [
                {"role": "system", "content": system or self.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

        last_err = None
        for attempt in range(4):
            try:
                resp = requests.post(self.url, json=payload, headers=headers, timeout=self.timeout)
                if resp.status_code in (429, 500, 502, 503, 504):
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
                resp.raise_for_status()
                data = resp.json()
                usage = data.get("usage") or {}
                self.prompt_tokens += usage.get("prompt_tokens", 0)
                self.completion_tokens += usage.get("completion_tokens", 0)
                return data["choices"][0]["message"]["content"].strip()
            except Exception as e:  # noqa: BLE001 - 重试覆盖网络/限流/格式三类问题
                last_err = e
                if attempt < 3:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"调用模型失败: {last_err}")

    def translate_chunk(self, chunk: str, title: str) -> str:
        """翻一块，并校验占位符。校验两次都不过就回退原文。"""
        want = sorted(PLACEHOLDER_RE.findall(chunk))
        prompt = (
            f"Article title: {title}\n\n"
            f"Translate this Markdown fragment into English.\n\n{chunk}"
        )

        for attempt in range(2):
            out = self._call(prompt)
            out = re.sub(r"^```[a-zA-Z]*\n(.*)\n```$", r"\1", out, flags=re.DOTALL)
            if sorted(PLACEHOLDER_RE.findall(out)) == want:
                return out
            print(f"    ! 占位符不匹配（第 {attempt + 1} 次），重试", file=sys.stderr)
            prompt += (
                "\n\nYour previous answer did not reproduce the [[Mn]] placeholders "
                "exactly. Translate again and keep every placeholder verbatim."
            )

        print("    ! 两次都不匹配，该块保留中文原文", file=sys.stderr)
        return chunk

    # mermaid 里这些字符是语法的一部分，译文凭空多一个方括号图就渲染不出来。
    # 代码块不查这个：注释里把全角（）写成 () 完全无害。
    MERMAID_STRUCT_RE = re.compile(r'[\[\]{}()<>|]')

    @classmethod
    def _fenced_is_safe(cls, src: str, out: str, kind: str) -> bool:
        if src.count("\n") != out.count("\n"):
            return False          # 译文里混进了换行，代码/图的行结构就散了
        if kind != "mermaid":
            return True
        return ([cls.MERMAID_STRUCT_RE.findall(l) for l in src.split("\n")]
                == [cls.MERMAID_STRUCT_RE.findall(l) for l in out.split("\n")])

    FENCED_SYSTEM = (
        "You translate short Chinese UI labels and source-code comments into English. "
        "You always answer with a JSON array of strings and nothing else."
    )

    def translate_fenced(self, block: str, kind: str, spans: list[tuple[int, int]]) -> str:
        """只翻 spans 指向的片段，其余字符原样保留。

        模型拿到的是一个字符串数组，返回的也必须是等长数组 —— 它从头到尾
        看不到代码结构，自然也改不坏。对不上就重试，再对不上就整块留中文。
        """
        texts = [block[a:b] for a, b in spans]
        if not texts:
            return block
        uniq = list(dict.fromkeys(texts))

        what = ("labels inside a Mermaid diagram" if kind == "mermaid"
                else f"comments inside {kind} source code")
        prompt = (
            f"Translate each string in this JSON array from Chinese to English. "
            f"They are {what}.\n\n"
            "Rules: reply with ONLY a JSON array of strings, the same length and the same "
            "order as the input. Keep each translation terse — these are labels and "
            "comments, not prose. Keep technical terms, identifiers and API names in "
            "English. If a string is already English, copy it through unchanged. No "
            "numbering, no explanation, no code fence.\n\n"
            + json.dumps(uniq, ensure_ascii=False)
        )

        for attempt in range(2):
            out = self._call(prompt, system=self.FENCED_SYSTEM).strip()
            out = re.sub(r"^```[a-zA-Z]*\n(.*)\n```$", r"\1", out, flags=re.DOTALL)
            try:
                got = json.loads(out)
            except json.JSONDecodeError:
                got = None

            if (isinstance(got, list) and len(got) == len(uniq)
                    and all(isinstance(x, str) for x in got)):
                mapping = dict(zip(uniq, got))
                parts, last = [], 0
                for (a, b), text in zip(spans, texts):
                    parts.append(block[last:a])
                    parts.append(mapping[text])
                    last = b
                parts.append(block[last:])
                result = "".join(parts)

                if self._fenced_is_safe(block, result, kind):
                    return result
                print(f"    ! 译文破坏了 {kind} 的结构（第 {attempt + 1} 次），重试",
                      file=sys.stderr)
            else:
                print(f"    ! 代码块译文不是等长 JSON 数组（第 {attempt + 1} 次），重试",
                      file=sys.stderr)

        print("    ! 该代码块保留中文原文", file=sys.stderr)
        return block

    def translate_title(self, title: str) -> str:
        return self._call(
            "Translate this Chinese blog post title into English. Output only the "
            f"title itself, no quotes, no trailing period.\n\n{title}"
        ).strip().strip('"')


# ----------------------------------------------------------------------
# 存储层
#
# 想改成「译文存回 issue 评论」只需要换掉这四个函数，上面的翻译逻辑一行不用动。
# 现在落仓库文件，是因为 GitHub 单条评论上限 65536 字符，而最长那几篇译成英文
# 会超过；而且提交到 main 会顺带触发 Cloudflare Pages 重建。
# ----------------------------------------------------------------------

def load_cache(cache_dir: str, name: str) -> dict:
    path = os.path.join(cache_dir, f"{name}.json")
    if not os.path.exists(path):
        return {"version": CACHE_VERSION, "blocks": {}}
    with open(path, encoding="utf-8") as f:
        cache = json.load(f)
    if cache.get("version") != CACHE_VERSION:
        return {"version": CACHE_VERSION, "blocks": {}}
    return cache


def save_cache(cache_dir: str, name: str, cache: dict) -> None:
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def load_translation(out_dir: str, name: str) -> str | None:
    path = os.path.join(out_dir, f"{name}.md")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return f.read()


def _without_timestamp(text: str) -> str:
    return re.sub(r'^translated_at:.*$\n?', '', text, flags=re.M)


def store_translation(out_dir: str, name: str, meta: dict, body: str) -> tuple[str, bool]:
    """写出译文，返回 (路径, 是否真的改了)。

    只有 translated_at 不同就当作没变。否则每跑一次 CI，13 个文件都会各改一行
    时间戳，于是每次 issue 编辑都换来一个「只动时间戳」的 bot 提交和一次毫无
    意义的站点重建 —— 而「译文无变化」那条分支永远走不到。
    """
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.md")
    front = "\n".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in meta.items())
    content = f"---\n{front}\n---\n\n{body}\n"

    old = load_translation(out_dir, name)
    if old is not None and _without_timestamp(old) == _without_timestamp(content):
        return path, False

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path, True


# ----------------------------------------------------------------------
# GitHub
# ----------------------------------------------------------------------

def gh_get(url: str, token: str | None, params: dict | None = None):
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_issue(owner: str, repo: str, number: int, token: str | None) -> dict:
    return gh_get(f"https://api.github.com/repos/{owner}/{repo}/issues/{number}", token)


def fetch_release_issues(owner: str, repo: str, token: str | None) -> list[dict]:
    issues, page = [], 1
    while True:
        batch = gh_get(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            token,
            {"state": "all", "labels": "Release", "per_page": 100, "page": page},
        )
        if not batch:
            return issues
        issues.extend(batch)
        page += 1


def strip_frontmatter(content: str) -> str:
    """和 fetch_github_content.extract_frontmatter_info 保持一致：正文不含 frontmatter。"""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", content or "", re.DOTALL)
    return (content or "")[m.end():].lstrip() if m else (content or "")


# ----------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------

def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def translate_body(body: str, title: str, name: str, translator, args, glossary_fp: str):
    """掩码 → 分块 → 查缓存 → 翻译 → 还原。返回 (英文正文, 英文标题, 命中统计)。

    issue 正文和 README 走的是同一条路，区别只在 name（决定缓存和产物文件名）。
    """
    cache = {} if args.force else load_cache(args.cache_dir, name)["blocks"]

    masker = Masker()
    masked = masker.mask(body)

    fenced_cjk = sum(1 for v in masker.values
                     if re.match(r'\s*(?:`{3,}|~{3,})', v) and CJK_RE.search(v))
    if not args.plan and fenced_cjk:
        called = translate_fenced_blocks(masker, translator, args, glossary_fp, cache)
        print(f"    代码块/mermaid 图含中文 {fenced_cjk} 个，本次调用模型 {called} 次")

    chunks = split_chunks(masked, args.max_chunk_chars)

    units = []
    for chunk in chunks:
        text, local_values = localize(chunk, masker)
        units.append({
            "text": text,
            "values": local_values,
            "translate": needs_translation(text),
            # glossary 指纹进 key：改了术语表，受影响的块会自然重翻
            "key": sha(f"{glossary_fp}\n{text}"),
        })

    todo = [u for u in units if u["translate"]]
    chars = sum(len(u["text"]) for u in todo)
    print(f"    {len(chunks)} 块，其中 {len(todo)} 块需要翻译（{chars} 字符），"
          f"{len(chunks) - len(todo)} 块是代码/图片/英文原文，直接透传")

    if args.plan:
        print(f"    另有 {fenced_cjk} 个代码块/mermaid 图含中文")
        return None, None, {"chunks": len(chunks), "todo": len(todo), "chars": chars}

    miss = [u for u in todo if u["key"] not in cache]
    hits = len(todo) - len(miss)
    if args.limit_chunks:
        skipped = max(0, len(miss) - args.limit_chunks)
        miss = miss[:args.limit_chunks]
        print(f"    缓存命中 {hits} 块，本次调用模型 {len(miss)} 次，"
              f"因 --limit-chunks 跳过 {skipped} 块（这些块会留中文原文）")
    else:
        print(f"    缓存命中 {hits} 块，本次调用模型 {len(miss)} 次")

    if miss:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futures = {pool.submit(translator.translate_chunk, u["text"], title): u for u in miss}
            done = 0
            for fut in concurrent.futures.as_completed(futures):
                cache[futures[fut]["key"]] = fut.result()
                done += 1
                print(f"    [{done}/{len(miss)}] 完成", file=sys.stderr)

    title_key = sha(f"title\n{glossary_fp}\n{title}")
    if title_key not in cache:
        # 标题没有中文就不用翻（比如 README 的 "About"）
        cache[title_key] = translator.translate_title(title) if CJK_RE.search(title) else title
    title_en = cache[title_key]

    parts = []
    for u in units:
        text = cache.get(u["key"], u["text"]) if u["translate"] else u["text"]
        parts.append(masker.restore(text, u["values"]))

    if not args.dry_run:
        blob = load_cache(args.cache_dir, name)
        blob["blocks"].update(cache)
        save_cache(args.cache_dir, name, blob)

    return "\n\n".join(parts), title_en, {
        "chunks": len(chunks), "todo": len(todo), "called": len(miss),
    }


def write_result(name: str, title: str, title_en: str, body: str, body_en: str,
                 args, extra: dict | None = None) -> None:
    meta = {
        "title": title_en,
        "title_zh": title,
        "source_hash": sha(body),
        "model": args.model,
        "cache_version": CACHE_VERSION,
        "translated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    meta.update(extra or {})

    if args.dry_run:
        print(f"\n===== {name}.md （dry-run，未落盘）=====\n")
        print(f"title: {title_en}\n")
        print(body_en)
        return

    path, changed = store_translation(args.out_dir, name, meta, body_en)
    print(f"    → {path}" if changed else f"    = {path}（内容未变，未改动文件）")


def translate_issue(issue: dict, translator, args, glossary_fp: str) -> None:
    number, title = issue["number"], issue["title"]
    body = strip_frontmatter(issue.get("body") or "")
    print(f"  issue #{number} 《{title}》")

    body_en, title_en, stats = translate_body(
        body, title, f"issue-{number}", translator, args, glossary_fp
    )
    if body_en is None:   # --plan
        return
    write_result(f"issue-{number}", title, title_en, body, body_en, args,
                 {"issue_number": number, "translated_blocks": stats["todo"]})


def translate_readme(username: str, branch: str, translator, args, glossary_fp: str) -> None:
    """个人主页 README（站点的 /about 页）。

    现在这份 README 本身就是英文，所以 needs_translation 会让它整篇透传，
    一次模型都不调；哪天改成中文写，这里不用动，自然就会翻了。
    """
    url = f"https://raw.githubusercontent.com/{username}/{username}/refs/heads/{branch}/README.md"
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        print(f"  跳过 README：HTTP {resp.status_code}")
        return

    print(f"  README（{username}/{username}@{branch}）")
    body, title = resp.text, "About"
    body_en, title_en, stats = translate_body(body, title, "about", translator, args, glossary_fp)
    if body_en is None:
        return
    write_result("about", title, title_en, body, body_en, args,
                 {"translated_blocks": stats["todo"]})


def load_glossary(path: str) -> dict[str, str]:
    if not os.path.exists(path):
        return {}
    with open(path, "rb") as f:
        return tomllib.load(f).get("terms", {})


def main():
    p = argparse.ArgumentParser(description="把 Release issue 翻译成英文")
    p.add_argument("--issue", type=int, action="append", help="issue 编号，可重复")
    p.add_argument("--all", action="store_true", help="翻译全部带 Release 标签的 issue")
    p.add_argument("--readme", action="store_true", help="只翻个人主页 README（站点的 /about 页）")
    p.add_argument("--skip-readme", action="store_true", help="--all 时跳过 README")
    p.add_argument("--config", default="hugo.toml")
    p.add_argument("--glossary", default="translations/glossary.toml")
    p.add_argument("--out-dir", default="translations/en")
    p.add_argument("--cache-dir", default="translations/cache")
    p.add_argument("--token", default=os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"),
                   help="GitHub token（缺省读 GITHUB_TOKEN / GH_TOKEN）")
    p.add_argument("--api-key", default=os.environ.get("DEEPSEEK_API_KEY"))
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL))
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--temperature", type=float, default=0.3)
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--max-chunk-chars", type=int, default=MAX_CHUNK_CHARS)
    p.add_argument("--limit-chunks", type=int, help="只翻前 N 块，用来快速试味道")
    p.add_argument("--force", action="store_true", help="忽略缓存，全部重翻")
    p.add_argument("--dry-run", action="store_true", help="翻译但不落盘，结果打到 stdout")
    p.add_argument("--plan", action="store_true", help="不调模型，只打印分块与成本预估")
    args = p.parse_args()

    if not args.issue and not args.all and not args.readme:
        p.error("至少指定 --issue N、--all 或 --readme")

    with open(args.config, "rb") as f:
        config = tomllib.load(f)
    gh_conf = config.get("params", {}).get("githubSync", {})
    repos = gh_conf.get("issue_repos") or [{"owner": gh_conf.get("username"), "repo": gh_conf.get("repo")}]

    glossary = load_glossary(args.glossary)
    system_prompt = build_system_prompt(glossary)
    glossary_fp = sha(system_prompt)[:16]
    print(f"术语表 {len(glossary)} 条，指纹 {glossary_fp}")

    translator = None
    if not args.plan:
        if not args.api_key:
            p.error("缺少 DeepSeek API key：export DEEPSEEK_API_KEY=... 或传 --api-key")
        translator = Translator(
            args.api_key, args.base_url, args.model, args.temperature, system_prompt
        )

    if args.readme or (args.all and not args.skip_readme):
        translate_readme(
            gh_conf.get("username"), gh_conf.get("branch", "main"),
            translator, args, glossary_fp,
        )

    # 只给了 --readme 就不去扫 issue
    for repo_conf in (repos if (args.all or args.issue) else []):
        owner, repo = repo_conf.get("owner"), repo_conf.get("repo")
        if not owner or not repo:
            continue
        if args.all:
            issues = fetch_release_issues(owner, repo, args.token)
        else:
            issues = [fetch_issue(owner, repo, n, args.token) for n in args.issue]
        print(f"{owner}/{repo}：待处理 {len(issues)} 篇")
        for issue in issues:
            if issue.get("pull_request"):
                continue
            translate_issue(issue, translator, args, glossary_fp)

    if translator and (translator.prompt_tokens or translator.completion_tokens):
        print(f"\n本次用量：输入 {translator.prompt_tokens} tokens，"
              f"输出 {translator.completion_tokens} tokens")


if __name__ == "__main__":
    main()
