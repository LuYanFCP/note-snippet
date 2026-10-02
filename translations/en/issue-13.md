---
title: "How to make Hugo support infographic"
title_zh: "如何让hugo支持infographic"
source_hash: "bd00da44171676c51bcd2bb794eebdd9f63b81b63914b3bdcaad9dd5e33d2aa1"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-02T05:26:00Z"
issue_number: 13
translated_blocks: 5
---

## Introduction
`infographic` is a new component from Ant Group's AntV team. Its goal is to provide easier-to-use visualization tools for AI, positioned similarly to mermaid. It offers a DSL that is easy for developers and AI to use: by quickly writing DSL, you can rapidly visualize all kinds of charts, such as line charts and pie charts, and you can also visualize tools like grid diagrams and SWOT diagrams that are typically needed in PPTs. It is very easy to use. So I wanted to bring it into my Hugo blog, and be able to quickly visualize my ideas through `infographic` in a markdown code block.

## How do we do it?
Hugo provides an [embedded code block render hook](https://github.com/gohugoio/hugo/blob/master/tpl/tplimpl/embedded/templates/_markup/render-codeblock-goat.html).
You can use a template to render code blocks for a specific language. Diagrams like Mermaid in Hugo can all be handled this way.

### step1: Add the JS import
Add a reference to the infographic package in the global header. You can add a reference to AntV Infographic in ` layouts/partials/foot_custom.html`

```html
<script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
```

### step2: Add a hook to render custom blocks

1. Add `layouts/_default/_markup/render-codeblock-infographic.html`
2. Render and inject into the overall HTML via templates and JS scripts
```javascript
<div id="infographic-{{ .Ordinal }}" class="infographic-container" style="min-height: 500px; width: 100%;"></div>
<script>
(function() {
  const container = document.getElementById('infographic-{{ .Ordinal }}');
  const syntax = `{{ .Inner | safeJS }}`;
  
  function renderInfographic() {
    if (window.AntVInfographic) {
      const { Infographic } = window.AntVInfographic;
      const infographic = new Infographic({
        container: container,
        width: '100%',
        height: '500px',
      });
      infographic.render(syntax);
    } else {
      // Retry if library not loaded yet
      setTimeout(renderInfographic, 100);
    }
  }
  
  if (document.readyState === 'complete') {
    renderInfographic();
  } else {
    window.addEventListener('load', renderInfographic);
  }
})();
</script>
{{ .Page.Store.Set "hasInfographic" true }}
```

## Result

example1: basic diagram

```infographic
infographic list-row-simple-horizontal-arrow
theme dark
  colorPrimary #61DDAA
  colorBg #1F1F1F
data
  items
    - label Step 1
      desc Start
    - label Step 2
      desc In Progress
    - label Step 3
      desc Complete
```

example2: architecture diagram

```infographic
infographic hierarchy-structure-mirror
data
  title System Layered Architecture
  desc Show modules and functional groups at different layers
  items
    - label Presentation Layer
      children
        - label Mini Program
        - label APP
        - label PAD
        - label Client
        - label WEB
    - label Application Layer
      children
        - label Core Modules
          children
            - label Feature 1
            - label Feature 2
            - label Feature 3
            - label Feature 4
            - label Feature 5
            - label Feature 6
        - label Basic Modules
          children
            - label Feature 1
            - label Feature 2
            - label Feature 3
            - label Feature 4
            - label Feature 5
            - label Feature 6
        - label Other Modules
          children
            - label Feature 1
            - label Feature 2
            - label Feature 3
            - label Feature 4
            - label Feature 5
            - label Feature 6
    - label Platform Layer
      children
        - label Module 1
          children
            - label Feature 1
            - label Feature 2
            - label Feature 3
            - label Feature 4
        - label Module 2
          children
            - label Feature 1
            - label Feature 2
            - label Feature 3
            - label Feature 4
        - label Module 3
          children
            - label Feature 1
            - label Feature 2
            - label Feature 3
            - label Feature 4
theme light
  palette antv
```
