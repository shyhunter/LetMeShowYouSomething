// SPDX-License-Identifier: Apache-2.0
// The pages in every browser engine and at every size a reviewer uses (D091). Test-only: the skill
// itself has no dependencies. The detailed Chrome checks in checks/browser/ stay as they are.
import { defineConfig } from '@playwright/test';

// Plain sizes rather than device presets: Firefox cannot emulate a mobile device, and the same
// sizes in every engine keep the results comparable.
const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true },
};
const ENGINES = ['chromium', 'firefox', 'webkit'];

export default defineConfig({
  testDir: 'test/browsers',
  timeout: 30_000,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { acceptDownloads: true },
  projects: ENGINES.flatMap((browserName) => Object.entries(SIZES).map(([size, use]) => ({
    name: `${browserName}-${size}`,
    use: { browserName, ...use },
    // The accessibility scan (axe) does not depend on the engine and is slow: Chromium at desktop and phone size only.
    ...(browserName === 'chromium' && size !== 'tablet' ? {} : { testIgnore: /a11y\.spec\.mjs$/ }),
  }))),
});
