import { LadybirdWebDriverClient } from './dist/webdriver_client.js';
import { INJECTED_AX_WALKER_SCRIPT, formatAXElementsToLineFormat } from './dist/ax_tree_formatter.js';

async function runTest() {
  console.log('--- 1. Connecting to Ladybird WebDriver ---');
  const client = new LadybirdWebDriverClient('http://127.0.0.1:8000');
  
  console.log('--- 2. Navigating to https://example.com ---');
  await client.navigate('https://example.com');
  const url = await client.getCurrentUrl();
  console.log('Current URL:', url);

  console.log('--- 3. Extracting Compact AX Tree (ladybird_get_agent_tree) ---');
  const elements = await client.executeScript(INJECTED_AX_WALKER_SCRIPT, []);
  const formatted = formatAXElementsToLineFormat(elements);
  console.log('Compact AX Tree Result:\n');
  console.log(formatted.formattedTree);
  console.log(`\nTotal Interactive Elements: ${formatted.elementCount}`);

  console.log('\n--- 4. Interacting with Element [1] (Clicking link) ---');
  const targetSelector = '[data-ladybird-agent-id="1"]';
  const elemId = await client.findElement('css selector', targetSelector);
  console.log('Found element ID:', elemId);
  await client.clickElement(elemId);
  
  const newUrl = await client.getCurrentUrl();
  console.log('URL after click:', newUrl);

  console.log('\n--- 5. Closing Session ---');
  await client.closeSession();
  console.log('Session closed successfully!');
}

runTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
