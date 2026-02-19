---
description: Attribution and acknowledgment of the Directus project that Brio is forked from.
readTime: 3 min read
---

# Fork Attribution

Brio is a fork of [Directus v9.26.0](https://github.com/directus/directus/tree/v9.26.0), the last version released under the GNU General Public License v3 (GPL-3.0).

## Original Project

- **Name**: Directus
- **Copyright**: (C) 2004-2023 Monospace Inc.
- **Repository**: https://github.com/directus/directus
- **License**: GPL-3.0
- **Fork Point**: v9.26.0

## Changes from Original

Brio builds upon the Directus v9.26.0 foundation with the following key changes:

- Complete rebranding from Directus to Brio
- Migration from Node.js runtime to Bun.js
- Removal of TypeScript precompilation (Bun runs TS natively)
- Updated Docker configuration for Bun.js
- Progressive frontend migration from Vue.js to React.js
- New extension architecture and features
- Updated package namespace from `@directus/*` to `@brio/*`

## License

Brio maintains the GPL-3.0 license as required by the original license terms.
All modifications and additions are Copyright (C) 2024-present Brio Contributors.

## Acknowledgment

We are grateful to the Directus team and community for building such a powerful open data platform.
This fork exists to explore different architectural directions while honoring the original project's
contributions to the open-source community.

## Divergence Notice

Please note that Brio and Directus are now separate projects with different development directions:

- **Brio**: Focused on Bun.js runtime, React.js frontend, and community-driven development
- **Directus**: Continues under proprietary licensing with its own roadmap

Users should choose the platform that best fits their needs and licensing requirements.
