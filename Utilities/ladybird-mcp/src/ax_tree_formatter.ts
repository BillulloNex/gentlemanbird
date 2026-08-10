export interface FormattedAXElement {
  id: number;
  role: string;
  name: string;
  value?: string;
  selector?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface FormattedAXTreeResult {
  formattedTree: string;
  elementCount: number;
}

/**
 * Injected script that runs inside Ladybird WebContent to build the compact element list with integer IDs
 */
export const INJECTED_AX_WALKER_SCRIPT = `return (function() {
  const interactiveRoles = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'tab', 'menuitem', 'option', 'searchbox']);
  const interactiveTags = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SUMMARY', 'DETAILS']);
  
  let currentId = 1;
  const elements = [];

  function isVisible(elem) {
    if (!elem) return false;
    const style = window.getComputedStyle(elem);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = elem.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getRole(elem) {
    if (elem.getAttribute('role')) return elem.getAttribute('role');
    const tag = elem.tagName;
    if (tag === 'A') return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'INPUT') {
      const type = (elem.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit') return 'button';
      return 'textbox';
    }
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'SELECT') return 'combobox';
    return tag.toLowerCase();
  }

  function getName(elem) {
    let name = elem.getAttribute('aria-label') || elem.getAttribute('placeholder') || elem.getAttribute('title') || '';
    if (!name && elem.labels && elem.labels.length > 0) {
      name = elem.labels[0].innerText;
    }
    if (!name) {
      name = elem.innerText || elem.textContent || '';
    }
    return name.trim().replace(/\\s+/g, ' ').slice(0, 80);
  }

  function walk(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const elem = node;
    
    if (!isVisible(elem)) return;

    const tag = elem.tagName.toUpperCase();
    const role = getRole(elem);
    const isInteractive = interactiveTags.has(tag) || interactiveRoles.has(role) || elem.hasAttribute('href') || elem.hasAttribute('onclick') || elem.getAttribute('tabindex') === '0';

    if (isInteractive) {
      const id = currentId++;
      elem.setAttribute('data-ladybird-agent-id', String(id));
      const rect = elem.getBoundingClientRect();
      elements.push({
        id,
        role,
        name: getName(elem),
        value: elem.value !== undefined ? String(elem.value) : undefined,
        bounds: {
          x: Math.round(rect.left + window.scrollX),
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }

    for (let child of elem.children) {
      walk(child);
    }
  }


  walk(document.body);
  return elements;
})();
`;

export function formatAXElementsToLineFormat(elements: FormattedAXElement[]): FormattedAXTreeResult {
  if (!elements || elements.length === 0) {
    return { formattedTree: 'No interactive elements found on page.', elementCount: 0 };
  }

  const lines = elements.map((elem) => {
    let line = `[${elem.id}] ${elem.role} "${elem.name || 'unnamed'}"`;
    if (elem.value) {
      line += ` value="${elem.value}"`;
    }
    if (elem.bounds) {
      line += ` x=${elem.bounds.x} y=${elem.bounds.y} w=${elem.bounds.width} h=${elem.bounds.height}`;
    }
    return line;
  });

  return {
    formattedTree: lines.join('\n'),
    elementCount: elements.length,
  };
}
