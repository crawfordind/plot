# Contributing to Plot

Thanks for your interest in contributing! Plot is open source, and community
contributions — bug reports, fixes, features, and docs — are welcome.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template and fill in the values (see the
   [README](README.md) for the exact filename and required variables):
   ```bash
   cp .env.example .env.local
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Making changes

- Create a branch off `master` for your work.
- Keep changes focused and match the existing code style.
- Run the linter (and any tests) before opening a pull request:
  ```bash
  npm run lint
  ```
- Write a clear PR description explaining **what** changed and **why**, and link
  any related issue.

## Reporting bugs & requesting features

Please use the issue templates. For bugs, include steps to reproduce, what you
expected, and what actually happened. **For security issues, do not open a public
issue** — contact the maintainer privately (see the
[Code of Conduct](CODE_OF_CONDUCT.md)).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the
project's AGPL-3.0 license (see [LICENSE](LICENSE)).
