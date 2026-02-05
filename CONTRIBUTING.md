# Contributing to Peek-A-Repo

Welcome to Peek-A-Repo! This guide will help you understand how to contribute effectively to this Chrome extension project.

## Table of Contents

- [Core Principles](#core-principles)
- [Before You Start](#before-you-start)
- [Contribution Workflow](#contribution-workflow)
- [Pull Request Requirements](#pull-request-requirements)
- [Coding Guidelines](#coding-guidelines)
- [Dependencies](#dependencies)
- [Testing](#testing)
- [Code Review Process](#code-review-process)
- [Getting Help](#getting-help)

## Core Principles

Peek-A-Repo maintains high standards for code quality and maintainability. Understanding and following these principles is essential for successful contributions:

**Small, focused changes**
: Each pull request should address a single concern. Multiple unrelated changes make review difficult and increase the likelihood of bugs.

**Discussion before implementation**
: For new features, open an issue and wait for maintainer approval before writing code. This ensures your work aligns with the project's direction and prevents wasted effort.

**Minimal dependencies**
: Every dependency increases maintenance burden and security surface area. New dependencies require strong justification and explicit approval.

**Clean diffs**
: Changes should be minimal and intentional. Avoid reformatting, refactoring, or style changes unrelated to your core contribution.

**Maintainability first**
: Code clarity trumps cleverness. Write code that future contributors can understand and modify confidently.

**Reviewability**
: Structure your changes to be easy to review. If a reviewer struggles to understand your changes, the PR will not be merged.

## Before You Start

### For Bug Fixes

1. Search existing issues to ensure the bug hasn't been reported
2. Create a new issue if one doesn't exist, describing:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Browser version and OS
3. Wait for a maintainer to acknowledge the issue
4. Submit your pull request referencing the issue number

### For New Features

1. Open an issue describing:
   - The problem you're solving
   - Your proposed solution
   - Why this belongs in the extension
2. Wait for discussion and maintainer approval
3. Implement exactly what was agreed upon
4. Submit your pull request

**Important**: Feature pull requests without prior issue discussion will be closed without review.

## Contribution Workflow

1. Fork the repository
2. Create a branch from `main` with a descriptive name:
   - `fix/tooltip-overflow` for bug fixes
   - `feat/delay-setting` for new features
3. Make your changes following the coding guidelines
4. Test thoroughly in Chrome
5. Submit a pull request with a clear description
6. Respond promptly to review feedback

## Pull Request Requirements

Before submitting, verify your pull request meets all requirements:

- [ ] Issue exists and has been discussed (required for features)
- [ ] Single responsibility: PR addresses one issue only
- [ ] Minimal diff: Only necessary changes included
- [ ] No unrelated changes: No formatting, refactoring, or style changes
- [ ] No new dependencies without explicit prior approval
- [ ] Code follows existing patterns and style
- [ ] Tested in latest stable Chrome
- [ ] No console errors or warnings
- [ ] Complex logic includes explanatory comments
- [ ] Commit messages are clear and descriptive
- [ ] PR description explains what, why, and how

### Pull Request Description Template

Your PR description should include:

**What**: Brief summary of the change

**Why**: Explanation of the problem being solved

**How**: High-level description of your approach

**Testing**: What you tested and how

**Screenshots**: For visual changes (before/after)

Do not include information that is already visible in the code diff, such as files changed or functions modified.

## Coding Guidelines

### General Principles

**Readability over brevity**
: Clear, verbose code is preferable to clever, compact code.

**Consistency**
: Match the existing code style. When in doubt, look at similar existing code.

**Comments for context**
: Explain why something is done, not what is being done. The code itself should make the "what" clear.

**Avoid unnecessary abstraction**
: Don't add layers of indirection unless they solve a real problem.

**No premature optimization**
: Optimize only when you have evidence of a performance problem.

### JavaScript Style

- Use modern ES6+ features where appropriate
- Prefer `const` by default; use `let` only when reassignment is necessary
- Avoid implicit behavior; make side effects and dependencies explicit
- Keep nesting shallow by extracting functions when logic becomes complex
- Use descriptive variable names; avoid abbreviations

### Chrome Extension Specifics

- Use Chrome APIs correctly (`chrome.storage`, `chrome.runtime`, etc.)
- Handle asynchronous operations with `async/await`
- Test in both light and dark GitHub themes
- Ensure content scripts don't leak memory
- Never include tracking or make external requests except to GitHub APIs
- Respect user privacy in all implementations

### CSS and Styling

- Use Tailwind utility classes consistently
- Match GitHub's design language
- Ensure responsive behavior across viewport sizes
- Test all interactive states (hover, focus, active)
- Maintain sufficient color contrast for accessibility
- Support keyboard navigation where applicable

### HTML

- Use semantic HTML elements
- Include appropriate accessibility attributes
- Use clear, descriptive class names
- Keep markup structure clean and logical

## Dependencies

We keep dependencies minimal to reduce maintenance burden, security risks, and bundle size. Before proposing a new dependency:

1. Verify the functionality cannot be implemented without it
2. Open an issue explaining:
   - Why the dependency is necessary
   - What alternatives you considered
   - The bundle size impact
   - The dependency's maintenance status
3. Wait for maintainer approval

Acceptable reasons for dependencies:

- Solves a complex problem that shouldn't be reimplemented (example: Prism for syntax highlighting)
- Significantly reduces code complexity without sacrificing maintainability
- Well-maintained with active development
- Minimal impact on bundle size

## Testing

We do not currently have automated tests. Manual testing is therefore critical:

1. Load the extension locally in Chrome
2. Test all functionality affected by your changes
3. Test edge cases:
   - Empty folders
   - Large files
   - Network errors
   - API rate limits
4. Test in multiple contexts:
   - Public and private repositories
   - Different file types
   - Light and dark themes
   - Various screen sizes
5. Check browser console for errors
6. Verify no regressions in existing features

## Code Review Process

All pull requests undergo maintainer review:

1. Initial review typically occurs within a few days
2. Maintainers will provide feedback or request changes
3. You should respond to feedback promptly
4. Once all concerns are addressed, the PR will be approved and merged

### What Reviewers Look For

- Does this solve the stated problem completely?
- Is the code clear and maintainable?
- Are edge cases properly handled?
- Is the diff minimal and focused?
- Does it follow project guidelines?
- Could this be implemented more simply?

### Responding to Feedback

- Address all comments, even small ones
- If you disagree with feedback, explain your reasoning clearly
- Mark conversations as resolved after addressing them
- Leave a comment when you've addressed all feedback and are ready for re-review
- If you cannot respond within a few days, leave a note about when you'll be able to continue

## Getting Help

If you have questions while working on your contribution:

1. Review this guide and linked documentation
2. Search existing issues and pull requests for similar situations
3. Open an issue with the `question` label, including:
   - What you're trying to accomplish
   - What you've tried so far
   - Where you're stuck
   - Relevant code snippets or error messages

When asking questions:

- Be specific about what you need help with
- Show what you've already tried
- Include error messages and stack traces when relevant
- Don't ask for general guidance like "How do I do this issue?"

## Commit Messages

Write clear, descriptive commit messages following this format:

```
Brief summary of the change (50 characters or less)

More detailed explanation of what changed and why. Wrap at 72
characters. Include relevant context that isn't obvious from the code.

- Use bullet points for multiple changes
- Reference issue numbers when applicable

Fixes #123
```

Good commit messages:

- Start with an imperative verb (Add, Fix, Update, Remove, Refactor)
- Use present tense
- Include context in the body when the change isn't obvious
- Reference related issue numbers

Bad commit messages:

- "fix bug"
- "updates"
- "WIP"
- "asdf"

## Communication Guidelines

- Be respectful in all interactions
- Be patient; maintainers are volunteers
- Be responsive to feedback and questions
- Be open to having your approach questioned
- Be collaborative; we're building this together

## Recognition

Contributors who submit quality pull requests that follow these guidelines will have their work reviewed promptly and merged when appropriate. All contributors are acknowledged in GitHub's contribution history.

## AI-Generated Code

If you use AI tools to assist with your contribution:

- You must understand every line of code you submit
- You must be able to explain your implementation choices
- Test all AI-generated code thoroughly
- Review and adapt the code to match project style
- The answer to "Why did you implement it this way?" should never be "The AI did it"

Pull requests that appear to be unreviewed AI output will be closed without review.

## Questions?

If you have questions about contributing:

1. Check if this guide answers your question
2. Search existing issues and discussions
3. Open a new issue with the `question` label

---

Thank you for contributing to Peek-A-Repo. Quality contributions, no matter how small, make a real difference to users of this extension.
