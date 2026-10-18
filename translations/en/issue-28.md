---
title: "Protecting private data when using LLMs"
title_zh: "使用 LLM 时的隐私数据防护"
source_hash: "d593fc28d17d0103f7575d24e109bc557e37234b85a4ae5f8c7168c614225028"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-18T11:32:09Z"
issue_number: 28
translated_blocks: 9
---

> This post came out of seeing the astrlink-guard model that 离离子 released today. Out of curiosity I looked a bit into the background and some of the usage. It felt like discovering a new continent — I'd never thought of inserting a dedicated model into a local proxy to filter sensitive messages and restore them on the model's response. Before this I mostly used crude methods like managing keys with something like `.env`, or injecting them into processes with 1Password's `op run --`. So I'm writing a short blog post to record it.

```x
https://x.com/Ion_Mio_/status/2111316064529514761?s=20
```

## 1. Why LLMs need privacy data protection

Since I work on inference, I mostly deal with server-side guardrails — modules that block extreme speech or NSFW content in model output, for example. A representative framework in this space is [Nemo-Guardrail](https://github.com/NVIDIA-NeMo/Guardrails). But when developing agents for personal use, or for internal enterprise use, you inevitably end up calling external models. That's where a lot of security-unaware practices creep in, or where the agent's own actions leak sensitive data, credentials and the like to the outside. For both individuals and companies, the cost of such a leak is hard to overstate. Anthropic and similar companies freely analyzing user data and producing reports only makes individuals and enterprises more worried about this.[^1]

In summary, guarding personal and sensitive information matters because:

1. It reduces the risk of leaking personal and company-sensitive information to commercial companies.
2. China's particular circumstances lead developers to rely heavily on relay/proxy services to access the world's top models, so personal and company-sensitive information must be kept from leaking to third-party relays.

## 2. Where should privacy data protection be implemented?

From a usage-habit perspective, this protection is typically implemented at a personal AI gateway or an enterprise-provided unified AI gateway. Typical personal AI gateway products include [CC-Switch](https://github.com/farion1231/cc-switch), [Magpie](https://github.com/yetone/magpie), and [AstrLink](https://github.com/Calcium-Ion/AstrLink), whose main goal is protocol conversion, aggregation, and routing between Agents and AI Providers. Enterprise aggregation gateways such as NewAPI, LiteLLM, and Sub2Api mainly manage the entire company's LLM Providers and provide internal aggregation of multiple LLM Providers, similar to an internal OpenRouter. What these two components have in common is that they serve as the bridge between Agent requests and LLM Providers, so this is generally the place where Guards specifically checking privacy information and data can be added through some Hooks.

## 3. How do we do it?

We still need to think through what conditions the Guard has to satisfy first. A privacy Guard sitting on the gateway should ideally do all of these at once: the upstream never sees the sensitive values; the Agent's work is unaffected — it can still grab a key and call the API; it must not noticeably slow down requests, and must not wreck the upstream's prompt cache; it must not break the protocol — streaming output, tool calls, and thinking signatures all have to keep working; and when something goes wrong, it's better to block than to leak.

The approach that satisfies these conditions is basically a pair of reversible transforms on the gateway: before the request goes out, swap sensitive values for placeholders and keep the mapping table locally; when the response comes back, swap them back according to the mapping table. The upstream only ever sees placeholders from start to finish.

![file-20261017230313788.png](https://raw.githubusercontent.com/LuYanFCP/note-snippet/main/static/images/issue-28/file-20261017230313788.png)

Most gateways implement Request-Processing / Response-Processing Hooks. If you've done backend work, these two should be very familiar to you — in backend development this process is usually called Middleware or a Hook. In pseudocode it looks roughly like this

```python
async def guard_request_hook(body: bytes) -> tuple[bytes]:
    doc = parse_protocol(body)           
    state_store = await get_store()
    for seg in doc.text_segments():
        spans = detect_pipeline(seg.text)
        for span in merge_and_filter(spans):
            ph = make_placeholder(span.kind, span.value)
            await state_store.set(ph, span.value)
            seg.replace(span, ph)
    return doc.serialize()
```

### 3.1 Basic implementation of requests

The laziest approach is to scan the entire request body as a string, but that causes problems. An Agent request contains not only user messages, but also the model name, `tool_call_id`, the tool's JSON schema, and each vendor's thinking signature: Anthropic thinking block's `signature`, OpenAI Responses' `encrypted_content`, Gemini's `thoughtSignature`. These are all protocol state that must be sent back verbatim on the next turn; change a single character and the upstream returns `invalid_encrypted_content` or a 400; if `tool_call_id` is altered, the tool call and tool result no longer match up. Yet these fields are long high-entropy strings that look a lot like keys, so detectors easily flag them by mistake.

So the first step should be to parse the request according to the protocol (Chat Completions, Responses, Anthropic Messages, Gemini) and pick out the text that actually needs checking: system prompt, user messages, assistant replies, tool arguments, tool results, while skipping protocol state as-is. The judgment must be based on structural position, role, and type, not just field names; otherwise a user pasting a `{"type":"reasoning","encrypted_content":"..."}` into a message can bypass detection. Detection and replacement are both done on the decoded string, and the result is re-serialized afterward, so you don't have to worry about JSON escaping.

### 3.2 Detection Pipeline

Generally speaking, rules plus models:

+ Rules are better suited to structured content, like API keys. This kind of check was already common in CI that scans repositories or in Git pre-commit hooks (to prevent keys from leaking into the repo), so just grab an off-the-shelf regex checking library.
+ Models are better suited to content that is hard to identify structurally, like names and addresses. "张伟", "王总", "小李" have no fixed format at all, and an address can be written as "the complex across from Wangjing SOHO" — regex has no idea where to start. The other category is content whose format is completely uniform and whose sensitivity depends entirely on context. The same `2024-03-15` is harmless in a log timestamp, but in "my birthday is 2024-03-15" it is personal information; the same long string of digits might be a bank account number or just an order ID. Passwords without a prefix are the same: the `S3cr3t2024` in `mysql -uroot -pS3cr3t2024`, or a casual line in chat like "the test DB password is qwerty2024" — regex either misses it or, in trying to catch it, falsely flags a pile of normal strings. Rules look at what a value looks like; models look at what context it appears in.

A lot of model work has been done on this before, both discriminative and generative, and many of the ideas come from early NLP entity extraction methods:

+ Discriminative: the recent Jev, and also [astrlink-guard](https://huggingface.co/QuantumNous/astrlink-guard) open-sourced by 离离子. Discriminative models come in many varieties too: BERT-Base fixes the labels up front, while GLiNER takes entity types at inference time as natural-language labels.
+ Generative ones, typically: gpt-oss-safeguard / Llama Guard 4. These models only tell you "is there a problem with this request", **they don't give spans, so they can only be used to warn or block, not to redact and restore**. Also, their Privacy category targets "the model's output leaking someone else's privacy". For example, Llama Guard's definition is exposing non-public personal information and endangering someone's safety, something like doxxing. That is not the same thing as "your own API key appearing in the prompt". **This kind of thing is mainly a server-side GuardRail, a guard at the whole-request level.**

### 3.3 Placeholder

This part is critical. Broadly, there are four aspects:

+ First, **it must be reversible**: every distinct value needs its own placeholder. If all emails are replaced with the same `<EMAIL_ADDRESS>`, you won't know which maps to which when restoring them.
+ Second, **it must be stable**: the same value must be replaced with the same placeholder in every turn. On one hand, what the model sees across multi-turn conversations needs to stay consistent; on the other hand, there's prompt cache. If placeholders are regenerated randomly each turn, then starting from the first replaced position, every turn's prefix differs from the previous turn's, and all subsequent KV cache is invalidated — costing both money and first-token latency.

The most obvious approach is to number by order of appearance: `<EMAIL_1>`, `<EMAIL_2>`. But this requires maintaining a table per session, and every request the gateway sees is stateless — reliably determining whether two requests belong to the same session isn't easy, and the numbering is also affected by order of appearance. A simpler approach is to derive the placeholder directly from the value itself — just hash the private data:

```python
KEY = os.urandom(32)
def make_placeholder(kind: str, value: str) -> str:
    digest = hmac.new(KEY, f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()
    return f"<{kind}_{digest[:16]}>" 
```

No state needed; the same value always yields the same placeholder. Here you must use HMAC rather than a plain hash, because the space of values like emails, phone numbers, and IPs is small — a bare hash can be brute-forced by enumeration. The cost is that after a process restart the key changes, all placeholders get renamed wholesale, and the cache is invalidated once.

+ Third, **it must be easy to recognize**. Placeholders must not collide with normal text so they're easy to find during restoration; ideally they carry a type, so the model seeing `<PRIVATE_EMAIL_...>` knows it's an email and its reasoning isn't much affected.

Some scenarios are format-sensitive. For example, an IP field in a config file — stuffing a `<...>` in may make the model think the format is wrong and casually "fix" it. In that case you can switch to a "looks real" stand-in, but it must come from reserved space that can never actually exist: for emails, use the `.invalid` top-level domain, e.g. `redacted-xxxx@private.invalid`; for IPv4, use the three RFC 5737 documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`; for IPv6, use `2001:db8::/32`. The IPv4 documentation ranges total only a bit over seven hundred addresses, so once exhausted you have to fall back to the marker form.

+ Fourth, **the model must know what these placeholders are about — this is extremely, extremely critical**. When replacement happens, the gateway can prepend a convention to the system prompt: copy placeholders byte for byte, don't guess the original value, don't base64 the placeholder or compute its length yourself (what you compute is the placeholder's, not the real value's), and when you see `203.0.113.7`, don't treat it as a documentation example and "correct" it. The `redaction-placeholders` skill in the AstrLink repo is exactly this — reading it feels a bit like teaching the model how to deal with a value it will never see.

### 3.4 Response restoration

For the restoration part, I recommend copying the response implementation straight from an inference engine (vLLM/Sglang) or a dedicated LLM gateway. Non-streaming is easy to handle — even find+replace will do it. For streaming, because of how LLM tokens work, it may take several tokens before a placeholder is fully emitted. The parsing logic here is basically the same as how an LLM inference engine frontend parses streaming tool calls. If you're interested, go read the Sglang/vLLM implementation — it's essentially a string-matching automaton.

Before the gateway hands the response to the Agent, it swaps the placeholders in the arguments back to the real keys, and the command runs locally as usual. The tool's output goes through detection again in the next round of requests: since the placeholder is derived from the value, the same key turns back into the same `<SECRET_9f3a1c0b7d2e4a68>`, so the model's context stays consistent across turns. Throughout the whole process the model never sees the real key even once, yet the job still gets done. Using `op run --` earlier only guaranteed the key wasn't sitting on disk in plaintext — as soon as the Agent did a `cat .env`, the value still went into the context and got sent out. The gateway layer governs what happens before sending, and the two can be used together.

The scope of restoration is also a trade-off. Tool arguments definitely need restoring, otherwise the command won't run; whether to restore the final reply shown to the user depends on your requirements. Restoring makes it read naturally for the user, but if the model quotes `<SECRET_...>` in its reply, the real key gets printed to the terminal and logs too. AstrLink restores everything by default, and at the same time requires in its conventions that the model not quote secret placeholders in replies.

## 4. Summary

What I described above protects identifiers and credentials, but it can't protect code and business logic. When you go through a relay/proxy service, keys, phone numbers, and personal names won't leak out, but the other side can still see your code, project structure, and requirement descriptions just fine. If that's what you're worried about, the only option is to self-host the model.

Detection can't be 100% either. In the astrlink-guard model card, 45 out of 2158 credentials were not masked at all, and 24 out of 187 coding requests that originally contained no sensitive information were falsely flagged. The easiest thing to miss is a password that has neither a field name nor a vendor prefix. The safer way to use it is to turn on dry-run mode first and watch it for a while, add the false positives to the whitelist, and then switch to redaction.

As for placement, the same logic can also live in an enterprise gateway, e.g. LiteLLM with Presidio for PII masking, plus `output_parse_pii: true` to swap the masks back to their original values in the response. The difference is that when it sits on the enterprise gateway, the data has already left the developer's machine, it just hasn't left the company yet; when it sits on a local gateway, the data is processed before it leaves the machine. For personal use a local gateway is the better fit, and for enterprises adding both layers doesn't conflict.

**In the end, the best approach for personal use is still: the crude methods agents commonly use to protect private information (settings deny, bash tool restrictions) + a gateway Guard.**

[^1]: [Detecting and countering misuse of AI: September 2026](https://www.anthropic.com/threat-intelligence-report-september-2026)
