# Peek-a-Repo 👀

Peek inside GitHub files and folders **without clicking**.

A small Chrome extension born out of pure developer frustration.

---

## The problem

Have you ever been inside a GitHub repository and felt this loop?

You open a file.  
You go back.  
You open another file.  
You go back.  
Again. And again.

Now add images to the mix, moreover a PDF is irritating

You can’t even see what an image is unless you open it. 
You can't even guess what content the PDF has unless you see its abstract or conclusion by opening it.
So you end up opening every single image, every single PDF one by one, just to figure out which one you want.

This constant back-and-forth is frustrating.  
Later I learned this behavior is called _pogo-sticking_ — but at that moment, it was just annoying.

I hit this problem while browsing a wallpaper repository.  
I had to select a few images, and opening each one individually was driving me crazy.  
I searched for a solution. I didn’t find one.

So I decided to build my own.

---

## The idea

What if you could just hover over a file in the GitHub file tree  
and instantly see what’s inside?

- Image file → show an image preview
- PDF file → show the rendered preview of the first pages
- Code file → show the code (with syntax highlighting)
- No clicking
- No page navigation
- No losing context

Inspired by Wikipedia-style hover popups, Peek-a-Repo lets you _peek_ inside files before opening them.
Worth reading the [Wikipedia article](https://wikimediafoundation.org/news/2018/04/20/why-it-took-a-long-time-to-build-that-tiny-link-preview-on-wikipedia/) where they explain why it took so long to build that tiny link preview on Wikipedia. It's cool to see how much effort went into making that tiny link preview on Wikipedia.

---

## Features

- **Hover previews for images**

  - Supports any aspect ratio
  - Images are scaled based on total resolution

- **Hover previews for PDFs**

  - Renders actual PDF pages (not just an icon)
  - Shows first 1-2 pages as a preview
  - Uses PDF.js for client-side rendering
  - Bypasses GitHub's download headers via background script

- **Hover previews for code files**

  - Fetches raw code using GitHub GraphQL API
  - Syntax highlighting using Prism.js (supports JS,TS,HTML,CSS,JSON,MD,Rust,Go,Python as of now, will add more soon, im lazy)

- **Hover previews for folders** (still doesnt work for all the folders, needs fixing)

  - Shows a mini GitHub-style file tree
  - Folder and file icons using GitHub’s Octicons (Primer)

- **Smart caching**

  - Hovering the same file twice does not re-fetch data
  - Works for images, PDFs, code files, and folders

- **Privacy-first**
  - GitHub token is stored locally using `chrome.storage`
  - No analytics, no tracking

---

## How it works

- Hover over a file in a GitHub repository
- Images are loaded instantly using GitHub raw URLs
- PDFs are fetched via background script (to bypass GitHub's Content-Disposition headers) and rendered using PDF.js in an isolated iframe
- Code files are fetched via the GitHub API and syntax-highlighted using Prism.js
- Only the top part of the file is shown to keep previews fast and lightweight

---

## Setup (for usage)

1. Clone this repository:

   ```bash
   git clone https://github.com/xevrion/peek-a-repo.git
   ```

2. Open Chrome/Brave and go to:
   `chrome://extensions` or
   `brave://extensions`

3. Enable **Developer mode** (top-right)

4. Click **Load unpacked**

5. Select the project folder

6. Open extension options and add your GitHub Personal Access Token  
   (required for code and folder previews)

That’s it. Go to any GitHub repo and hover over files.

---

## Setup (for development)

1. Install dependenies (only Tailwind is needed):

   ```bash
   npm install
   ```

2. Run Tailwind in watch mode:

   ```bash
   npx tailwindcss -i ./input.css -o ./tailwind.css --minify --watch
   ```

3. Make changes to the code

4. Reload the extension from:
   `chrome://extensions` or
   `brave://extensions`

---

## Why this exists

This project started from a real problem I faced.  
I couldn’t find an existing solution, so I built one.

Simple as that.
