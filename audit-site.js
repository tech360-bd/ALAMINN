const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console errors or failed API requests during interaction
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`⚠️ Browser Console Error: ${msg.text()}`);
    }
  });

  const baseUrl = 'https://alaminn.info';
  const visited = new Set();
  const queue = ['/', '/higher-study/course-finder', '/contact', '/higher-study/universities'];
  
  console.log(`🚀 Starting deep interactive crawl & click audit on ${baseUrl}...\n`);

  while (queue.length > 0) {
    const route = queue.shift();
    if (visited.has(route)) continue;
    visited.add(route);

    const targetUrl = `${baseUrl}${route}`;
    try {
      console.log(`\n📄 Testing page: ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      console.log(`✅ Page loaded successfully`);

      // 1. Test clicking filter buttons or tabs if present
      const filterButtons = await page.$$('button, [role="tab"], .filter-btn, input[type="checkbox"]');
      console.log(`   Found ${filterButtons.length} potential interactive buttons/filters.`);

      let clickedCount = 0;
      for (let i = 0; i < Math.min(filterButtons.length, 5); i++) {
        try {
          const btn = filterButtons[i];
          const text = await btn.textContent();
          const isVisible = await btn.isVisible();
          
          if (isVisible && text && text.trim().length > 0 && text.length < 30) {
            // Avoid clicking destructive buttons like delete/logout
            const lowerText = text.toLowerCase();
            if (!lowerText.includes('delete') && !lowerText.includes('logout') && !lowerText.includes('remove')) {
              await btn.click({ timeout: 2000 });
              clickedCount++;
            }
          }
        } catch (e) {
          // Element might be detached or unclickable, safely skip
        }
      }
      console.log(`   Successfully interacted with ${clickedCount} filter/button elements.`);

      // 2. Test form inputs if a search bar or input field exists
      const inputs = await page.$$('input[type="text"], input[type="search"]');
      if (inputs.length > 0) {
        try {
          await inputs[0].fill('Software Engineering');
          console.log(`   Tested typing into search/input field successfully.`);
        } catch (e) {
          // Input might not be writable
        }
      }

      // 3. Discover new internal links to crawl
      const links = await page.$$('a[href]');
      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href && href.startsWith('/') && !visited.has(href) && !href.includes('#')) {
          queue.push(href);
        }
      }

    } catch (err) {
      console.error(`❌ Error interacting with ${targetUrl}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Interactive audit complete! Successfully tested and clicked elements across ${visited.size} core views.`);
  await browser.close();
})();
