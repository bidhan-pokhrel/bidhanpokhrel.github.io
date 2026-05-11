# How to Add a New Post

## 3 steps. No login. No tools. Just files.

---

### Step 1 — Copy the template

```
posts/post-template.html  →  posts/my-new-post.html
```

Name it something like `building-rag-pipeline.html` (lowercase, hyphens, no spaces).

---

### Step 2 — Edit your post

Open `posts/my-new-post.html` in any text editor (VS Code, Notepad, anything).

The things to edit are marked with `★ EDIT:` comments:

```html
<title>Your Post Title — Bidhan Pokhrel</title>   ← change title
<div class="post-kicker">// DEV_LOG</div>          ← or // APP
<h1 class="post-title">Your Post Title</h1>        ← change title
<span>May 11, 2026</span>                          ← change date
<div class="tags">                                 ← change tags
<div class="post-body">                            ← write your content here
```

---

### Step 3 — Add one line to manifest.json

Open `posts/manifest.json` and add your entry at the top:

```json
[
  {
    "file":    "my-new-post.html",
    "type":    "devlog",
    "title":   "Building a RAG Pipeline for Finance Docs",
    "date":    "2026-05-15",
    "tags":    ["AI", "RAG", "Python", "LLM"],
    "excerpt": "How I built a production RAG pipeline that handles 50k financial documents.",
    "cover":   ""
  },
  {
    "file":    "hello-world.html",
    ...existing entry...
  }
]
```

**Field guide:**

| Field    | Required | Value |
|----------|----------|-------|
| `file`   | ✓ | Filename inside `posts/` folder |
| `type`   | ✓ | `"devlog"` or `"app"` |
| `title`  | ✓ | Shown on the card |
| `date`   | ✓ | `"YYYY-MM-DD"` format |
| `tags`   |   | Array of strings |
| `excerpt`|   | 1-2 sentence summary shown on card |
| `cover`  |   | Path to cover image, or `""` for none |

---

### Push to GitHub

```bash
git add posts/my-new-post.html posts/manifest.json
git commit -m "New post: Building a RAG Pipeline"
git push
```

That's it. Your site updates automatically in ~30 seconds.

---

## For Published Apps

Same process but use `"type": "app"`. The card gets a blue left border
and appears under the **Published Apps** tab.

---

## Editing profile info

Open `index.html` directly and edit the HTML in the **PROFILE** section
(it's marked with a comment). Change your name, bio, social links,
skills list — it's just HTML, no special syntax.

---

## No passwords. No tokens. No hacking possible.

The only way to change your site is to push to GitHub —
and only you have access to your repository.
