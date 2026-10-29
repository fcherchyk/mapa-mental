export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 44;
export const LEVEL_GAP = 64;
export const SIBLING_GAP = 16;

export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  positions: Record<string, Position>;
  edges: { source: string; target: string }[];
}

/**
 * Árbol horizontal: la x crece con el nivel y cada hoja ocupa su propia franja vertical, en
 * orden; un padre queda centrado entre su primer y su último hijo, así los subárboles no se pisan.
 */
export function layoutTree(rootId: string, childrenOf: (id: string) => string[]): Layout {
  const positions: Record<string, Position> = {};
  const edges: Layout['edges'] = [];
  let nextLeafY = 0;

  const place = (id: string, level: number): number => {
    const children = childrenOf(id);
    let y: number;
    if (children.length === 0) {
      y = nextLeafY;
      nextLeafY += NODE_HEIGHT + SIBLING_GAP;
    } else {
      const childYs = children.map((child) => {
        edges.push({ source: id, target: child });
        return place(child, level + 1);
      });
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    positions[id] = { x: level * (NODE_WIDTH + LEVEL_GAP), y };
    return y;
  };

  place(rootId, 0);
  return { positions, edges };
}
