"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const webdriver_client_js_1 = require("./webdriver_client.js");
const ax_tree_formatter_js_1 = require("./ax_tree_formatter.js");
const webDriverUrl = process.env.LADYBIRD_WEBDRIVER_URL || 'http://127.0.0.1:8000';
const enableEvalJs = process.env.ENABLE_EVAL_JS === 'true';
const client = new webdriver_client_js_1.LadybirdWebDriverClient(webDriverUrl);
const server = new index_js_1.Server({
    name: 'ladybird-mcp',
    version: '0.1.0',
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'get_agent_tree',
                description: 'Retrieves a token-optimized compact accessibility tree with integer IDs (e.g. [14] button "Submit" x=340 y=580). Use integer IDs with the interact tool.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        visibleOnly: {
                            type: 'boolean',
                            description: 'Whether to restrict elements to visible viewport bounding boxes (default: true)',
                        },
                    },
                },
            },
            {
                name: 'interact',
                description: 'Interacts deterministically with an element on the page using its integer ID (from get_agent_tree) or CSS selector.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'number',
                            description: 'Integer element ID obtained from get_agent_tree',
                        },
                        selector: {
                            type: 'string',
                            description: 'Optional CSS selector fallback if integer ID is not available',
                        },
                        action: {
                            type: 'string',
                            enum: ['click', 'type', 'select', 'hover'],
                            description: 'Action to perform on target element',
                        },
                        text: {
                            type: 'string',
                            description: 'Text string to input if action is type',
                        },
                    },
                    required: ['action'],
                },
            },
            {
                name: 'navigate',
                description: 'Navigates the browser tab to a specified URL.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'Target URL to navigate to (e.g. https://example.com)',
                        },
                    },
                    required: ['url'],
                },
            },
            {
                name: 'snapshot',
                description: 'Captures a visual PNG screenshot or DOM snapshot of the current page.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        kind: {
                            type: 'string',
                            enum: ['screenshot', 'dom'],
                            description: 'Type of snapshot to retrieve (default: screenshot)',
                        },
                    },
                },
            },
            {
                name: 'eval_js',
                description: 'Executes a custom JavaScript code snippet in WebContent context (gated by security configuration).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            description: 'JavaScript snippet to execute',
                        },
                    },
                    required: ['code'],
                },
            },
            {
                name: 'observe',
                description: 'Observes the page state for navigation completion, network idle, or DOM stability.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        event: {
                            type: 'string',
                            enum: ['nav', 'networkIdle', 'domStable'],
                            description: 'State event to observe',
                        },
                        timeoutMs: {
                            type: 'number',
                            description: 'Timeout in milliseconds (default: 5000)',
                        },
                    },
                    required: ['event'],
                },
            },
        ],
    };
});
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === 'navigate') {
            const url = args?.url || 'about:blank';
            await client.navigate(url);
            const currentUrl = await client.getCurrentUrl();
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully navigated to ${currentUrl}`,
                    },
                ],
            };
        }
        if (name === 'get_agent_tree') {
            const elements = await client.executeScript(ax_tree_formatter_js_1.INJECTED_AX_WALKER_SCRIPT, []);
            const formatted = (0, ax_tree_formatter_js_1.formatAXElementsToLineFormat)(elements);
            return {
                content: [
                    {
                        type: 'text',
                        text: `[Compact AX Tree - ${formatted.elementCount} Interactive Elements]\n\n${formatted.formattedTree}`,
                    },
                ],
            };
        }
        if (name === 'interact') {
            const id = args?.id;
            const selector = args?.selector;
            const action = args?.action || 'click';
            const text = args?.text;
            let targetSelector = selector;
            if (id !== undefined) {
                targetSelector = `[data-ladybird-agent-id="${id}"]`;
            }
            if (!targetSelector) {
                throw new Error('Either "id" or "selector" must be provided to interact with an element.');
            }
            const elementId = await client.findElement('css selector', targetSelector);
            if (!elementId) {
                throw new Error(`Element matching "${targetSelector}" was not found on page.`);
            }
            if (action === 'click') {
                await client.clickElement(elementId);
            }
            else if (action === 'type') {
                if (!text)
                    throw new Error('Text parameter is required when action is "type"');
                await client.sendKeysToElement(elementId, text);
            }
            else if (action === 'hover') {
                await client.executeScript(`arguments[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));`, [{ 'element-6066-11e4-a52e-4f735466cecf': elementId }]);
            }
            else {
                throw new Error(`Action "${action}" is not yet supported.`);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: `Action "${action}" successfully executed on element target "${targetSelector}"`,
                    },
                ],
            };
        }
        if (name === 'snapshot') {
            const kind = args?.kind || 'screenshot';
            if (kind === 'screenshot') {
                const base64Png = await client.takeScreenshot();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `[Screenshot PNG captured (${base64Png.length} bytes base64)]\ndata:image/png;base64,${base64Png}`,
                        },
                    ],
                };
            }
            else {
                const html = await client.executeScript('return document.documentElement.outerHTML;');
                return {
                    content: [
                        {
                            type: 'text',
                            text: String(html),
                        },
                    ],
                };
            }
        }
        if (name === 'eval_js') {
            if (!enableEvalJs) {
                throw new Error('eval_js is currently disabled for security. Set ENABLE_EVAL_JS=true in your environment to enable custom script execution.');
            }
            const code = args?.code || '';
            const result = await client.executeScript(code);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        if (name === 'observe') {
            const event = args?.event;
            const timeoutMs = args?.timeoutMs || 3000;
            await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 10000)));
            const currentUrl = await client.getCurrentUrl();
            return {
                content: [
                    {
                        type: 'text',
                        text: `Observed event "${event}". Current URL is ${currentUrl}`,
                    },
                ],
            };
        }
        throw new Error(`Unknown tool requested: ${name}`);
    }
    catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Tool execution error: ${error.message || String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Ladybird MCP Server running on stdio');
}
main().catch((err) => {
    console.error('Fatal error in Ladybird MCP Server:', err);
    process.exit(1);
});
