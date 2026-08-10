export interface FormattedAXElement {
    id: number;
    role: string;
    name: string;
    value?: string;
    selector?: string;
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export interface FormattedAXTreeResult {
    formattedTree: string;
    elementCount: number;
}
/**
 * Injected script that runs inside Ladybird WebContent to build the compact element list with integer IDs
 */
export declare const INJECTED_AX_WALKER_SCRIPT = "\n(function() {\n  const interactiveRoles = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'tab', 'menuitem', 'option', 'searchbox']);\n  const interactiveTags = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SUMMARY', 'DETAILS']);\n  \n  let currentId = 1;\n  const elements = [];\n\n  function isVisible(elem) {\n    if (!elem) return false;\n    const style = window.getComputedStyle(elem);\n    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;\n    const rect = elem.getBoundingClientRect();\n    return rect.width > 0 && rect.height > 0;\n  }\n\n  function getRole(elem) {\n    if (elem.getAttribute('role')) return elem.getAttribute('role');\n    const tag = elem.tagName;\n    if (tag === 'A') return 'link';\n    if (tag === 'BUTTON') return 'button';\n    if (tag === 'INPUT') {\n      const type = (elem.getAttribute('type') || 'text').toLowerCase();\n      if (type === 'checkbox') return 'checkbox';\n      if (type === 'radio') return 'radio';\n      if (type === 'button' || type === 'submit') return 'button';\n      return 'textbox';\n    }\n    if (tag === 'TEXTAREA') return 'textbox';\n    if (tag === 'SELECT') return 'combobox';\n    return tag.toLowerCase();\n  }\n\n  function getName(elem) {\n    let name = elem.getAttribute('aria-label') || elem.getAttribute('placeholder') || elem.getAttribute('title') || '';\n    if (!name && elem.labels && elem.labels.length > 0) {\n      name = elem.labels[0].innerText;\n    }\n    if (!name) {\n      name = elem.innerText || elem.textContent || '';\n    }\n    return name.trim().replace(/\\s+/g, ' ').slice(0, 80);\n  }\n\n  function walk(node) {\n    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;\n    const elem = node;\n    \n    if (!isVisible(elem)) return;\n\n    const tag = elem.tagName;\n    const role = getRole(elem);\n    const isInteractive = interactiveTags.has(tag) || interactiveRoles.has(role) || elem.hasAttribute('onclick') || elem.getAttribute('tabindex') === '0';\n\n    if (isInteractive) {\n      const id = currentId++;\n      elem.setAttribute('data-ladybird-agent-id', String(id));\n      const rect = elem.getBoundingClientRect();\n      elements.push({\n        id,\n        role,\n        name: getName(elem),\n        value: elem.value !== undefined ? String(elem.value) : undefined,\n        bounds: {\n          x: Math.round(rect.left + window.scrollX),\n          y: Math.round(rect.top + window.scrollY),\n          width: Math.round(rect.width),\n          height: Math.round(rect.height)\n        }\n      });\n    }\n\n    for (let child of elem.children) {\n      walk(child);\n    }\n  }\n\n  walk(document.body);\n  return elements;\n})();\n";
export declare function formatAXElementsToLineFormat(elements: FormattedAXElement[]): FormattedAXTreeResult;
