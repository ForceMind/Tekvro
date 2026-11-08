# Tekvro website entry pages

This directory contains lightweight English and Simplified Chinese landing,
installation, and FAQ pages. The complete user and technical documentation lives
in [`docs/`](../docs/index.md). Keep instructions there; entry pages should help
readers find the appropriate guide.

Version 1.0.0 is distributed through the
[GitHub Release](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0).
The website points to the verified release installer and `tekvro-1.0.0.tgz`;
it does not publish a separate package or claim a configured public domain.

## Local preview

From the repository root:

```sh
python3 scripts/prepare-website.py
python3 -m http.server 4173 --bind 127.0.0.1 --directory website/public
```

Open <http://127.0.0.1:4173/> or <http://127.0.0.1:4173/zh-CN/>. Check both
languages, a narrow viewport, keyboard navigation, copy controls, and expanded
FAQ answers. Shared assets and page links use relative paths so the pages also
work when served beneath a project path.

## Validation

```sh
python3 scripts/prepare-website.py
python3 scripts/verify-website.py
```

The verifier checks local references, HTML fragments, SVG syntax, the generated
example ZIP, and the existing publisher configuration. It does not establish
that a public deployment exists or that an optional analysis provider works.

For the complete documentation preview:

```sh
npm run docs:dev
npm run docs:build
```

## Files and maintenance

- `public/index.html` and `public/zh-CN/index.html`: product overview and documentation links.
- `public/get-started/` and `public/zh-CN/get-started/`: release installation and the first environment checks.
- `public/faq/` and `public/zh-CN/faq/`: concise answers with links to the full guides and support policy.
- `public/assets/`: shared styles, copy controls, and navigation behavior.
- `public/examples/notes-electron/` and `public/examples/notes-web/`: small local analysis fixtures used by existing examples and tests.
- `archive/pre-1.0/` and `evidence/`: historical source and research records, excluded from the public website artifact.

Do not turn historical investigations into Tekvro release claims by changing
names or version labels. Keep recorded target identity, attribution, and
verification scope in their original research records. Product pages should
state only supported current behavior and link to the current documentation.

Required legal information is maintained in [`LICENSE`](../LICENSE) and
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Keep these links in every
product footer.

Publication configuration is separate from local preview. The existing
`.github/workflows/website-pages.yml` remains guarded; this README does not
instruct maintainers to deploy it or change hosting settings.
