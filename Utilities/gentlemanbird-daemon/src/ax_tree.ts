/**
 * Token-Optimized Accessibility Tree Extractor
 *
 * Extracts a compact, LLM-friendly representation of the page's interactive elements.
 * Uses JS injection via WebDriver executeScript to walk the DOM and return elements
 * in the format: [14] button "Submit" x=340 y=580 w=120 h=40
 *
 * Ported from ladybird-mcp/ax_tree_formatter.ts with improvements for the daemon.
 */

export interface AXElement {
  id: number;
  role: string;
  name: string;
  value?: string;
  selector?: string;
  bounds: { x: number; y: number; width: number; height: number };
  interactive: boolean;
}

export interface AXTreeSnapshot {
  elements: AXElement[];
  formatted: string;
  elementCount: number;
  url: string;
  title: string;
  timestamp: number;
}

/**
 * JavaScript to inject into the page that walks the DOM and returns
 * interactive/semantic elements with bounding boxes and integer IDs.
 */
export const AX_WALKER_SCRIPT = `return (function() {
  const interactiveRoles = new Set([
    'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
    'listbox', 'tab', 'menuitem', 'option', 'searchbox', 'slider',
    'switch', 'spinbutton', 'menu', 'menubar', 'tablist', 'tree',
    'treeitem', 'dialog', 'alertdialog'
  ]);
  const interactiveTags = new Set([
    'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION',
    'SUMMARY', 'DETAILS', 'LABEL'
  ]);
  const semanticTags = new Set([
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'NAV', 'MAIN',
    'HEADER', 'FOOTER', 'ARTICLE', 'SECTION', 'FORM', 'TABLE',
    'TH', 'TD', 'LI', 'P'
  ]);

  let currentId = 1;
  const elements = [];

  function isVisible(elem) {
    if (!elem || !elem.getBoundingClientRect) return false;
    const style = window.getComputedStyle(elem);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = elem.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getRole(elem) {
    const explicit = elem.getAttribute && elem.getAttribute('role');
    if (explicit) return explicit;
    const tag = elem.tagName;
    if (tag === 'A') return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'INPUT') {
      const type = (elem.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit') return 'button';
      if (type === 'search') return 'searchbox';
      if (type === 'range') return 'slider';
      return 'textbox';
    }
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'IMG') return 'img';
    if (tag === 'NAV') return 'navigation';
    if (tag === 'MAIN') return 'main';
    if (tag === 'FORM') return 'form';
    if (/^H[1-6]$/.test(tag)) return 'heading';
    return tag.toLowerCase();
  }

  function getName(elem) {
    let name = '';
    if (elem.getAttribute) {
      name = elem.getAttribute('aria-label') || elem.getAttribute('alt') ||
             elem.getAttribute('placeholder') || elem.getAttribute('title') || '';
    }
    if (!name && elem.labels && elem.labels.length > 0) {
      name = elem.labels[0].innerText || '';
    }
    if (!name) {
      const img = elem.querySelector && elem.querySelector('img');
      if (img) name = img.getAttribute('alt') || img.getAttribute('title') || '';
    }
    if (!name) {
      name = (elem.innerText || elem.textContent || '').trim();
    }
    // Truncate long names for token efficiency
    if (name.length > 80) name = name.substring(0, 77) + '...';
    return name;
  }

  function getValue(elem) {
    if (elem.value !== undefined && elem.value !== '') return String(elem.value);
    if (elem.checked !== undefined) return String(elem.checked);
    return undefined;
  }

  function getSelector(elem) {
    if (elem.id) return '#' + elem.id;
    const tag = elem.tagName.toLowerCase();
    const cls = elem.className && typeof elem.className === 'string'
      ? '.' + elem.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    return tag + cls;
  }

  function walk(node, visibleOnly) {
    if (!node) return;
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const elem = children[i];
      if (!elem.tagName) continue;

      const tag = elem.tagName;
      const role = getRole(elem);
      const isInteractive = interactiveTags.has(tag) || interactiveRoles.has(role) ||
                           (elem.getAttribute && elem.getAttribute('onclick')) ||
                           (elem.getAttribute && elem.getAttribute('tabindex') !== null);
      const isSemantic = semanticTags.has(tag);

      if ((isInteractive || isSemantic) && (!visibleOnly || isVisible(elem))) {
        const rect = elem.getBoundingClientRect();
        elements.push({
          id: currentId++,
          role: role,
          name: getName(elem),
          value: getValue(elem),
          selector: getSelector(elem),
          interactive: isInteractive,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }
      walk(elem, visibleOnly);
    }
  }

  walk(document.body, VISIBLE_ONLY_PLACEHOLDER);
  return elements;
})();`;

/**
 * Format raw AX elements into the compact line format for LLM consumption.
 * Example: [14] button "Submit" x=340 y=580 w=120 h=40
 */
export function formatAXTree(elements: AXElement[]): string {
  return elements
    .map((el) => {
      const parts = [`[${el.id}]`, el.role];
      if (el.name) parts.push(`"${el.name}"`);
      if (el.value !== undefined) parts.push(`val="${el.value}"`);
      if (el.bounds) {
        parts.push(`x=${el.bounds.x} y=${el.bounds.y} w=${el.bounds.width} h=${el.bounds.height}`);
      }
      return parts.join(' ');
    })
    .join('\n');
}

/**
 * Build the injection script with the visibleOnly parameter baked in.
 */
export function buildAXWalkerScript(visibleOnly: boolean = true): string {
  return AX_WALKER_SCRIPT.replace('VISIBLE_ONLY_PLACEHOLDER', String(visibleOnly));
}
