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

Now add images to the mix.

You can’t even see what an image is unless you open it.  
So you end up opening every single image, one by one, just to figure out which one you want.

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
- Code file → show the code (with syntax highlighting)
- No clicking
- No page navigation
- No losing context

Inspired by Wikipedia-style hover popups, Peek-a-Repo lets you _peek_ inside files before opening them.

---

## How it works

- Hover over a file in a GitHub repository
- Images are loaded instantly using GitHub raw URLs
- Code files are fetched via the GitHub API and syntax-highlighted using Prism.js
- Only the top part of the file is shown to keep previews fast and lightweight

---

## Why this exists

This project started from a real problem I faced.  
I couldn’t find an existing solution, so I built one.

Simple as that.

dev: `npx tailwindcss -i ./input.css -o ./tailwind.css --minify --watch` ~ run this while developing to watch for changes and compile the css
