const PERIPHERAL = new Set(['gen', 'sgen', 'load']);

export function initDrag(cy) {
  let grabPos    = null;
  let companions = [];

  cy.on('grabon', 'node', evt => {
    const node = evt.target;
    grabPos = { ...node.position() };

    if (node.data('type') !== 'bus') {
      companions = [];
      return;
    }

    companions = [];
    node.connectedEdges('[type = "connection"]').forEach(edge => {
      edge.connectedNodes().forEach(n => {
        if (PERIPHERAL.has(n.data('type'))) {
          const p = n.position();
          companions.push({ node: n, ox: p.x, oy: p.y });
        }
      });
    });
  });

  cy.on('drag', 'node', evt => {
    if (!grabPos || !companions.length) return;
    const p  = evt.target.position();
    const dx = p.x - grabPos.x;
    const dy = p.y - grabPos.y;
    companions.forEach(({ node, ox, oy }) => {
      node.position({ x: ox + dx, y: oy + dy });
    });
  });

  cy.on('free', 'node', () => {
    grabPos    = null;
    companions = [];
  });
}
