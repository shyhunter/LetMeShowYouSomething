// SPDX-License-Identifier: MIT-0
// Resolve one explicit review selection without changing the review or choosing a guessed item.
// Self-contained so the renderer can inline the same function that the unit tests exercise.
export function resolveReviewSelection(review, target) {
  if (!review || !target || typeof target !== 'object' || Array.isArray(target)) return null;
  const list = value => Array.isArray(value) ? value : [];
  const find = (values, id) => {
    if (typeof id !== 'string' || !id) return null;
    const matches = list(values).filter(value => value?.id === id);
    return matches.length === 1 ? matches[0] : null;
  };
  const items = list(review.items), screens = list(review.flow?.screens);
  const result = { target: null, label: null, itemId: null, screenId: null,
    relatedItemIds: [], diagramId: null, commentTarget: null, layerKey: null, outcomeIndex: null };
  const setItem = item => {
    if (item.step && !find(screens, item.step.from)) return false;
    result.itemId = item.id;
    result.relatedItemIds = [item.id];
    result.screenId = item.step?.from ?? null;
    return true;
  };
  const setScreen = screen => {
    const related = items.filter(item => item?.step?.from === screen.id);
    if (related.some(item => !find(items, item.id))) return false;
    result.screenId = screen.id;
    result.relatedItemIds = related.map(item => item.id);
    return true;
  };
  if (target.kind === 'item') {
    const item = find(items, target.itemId);
    if (!item || !setItem(item)) return null;
    result.target = { kind: 'item', itemId: item.id };
    result.label = item.title ?? null;
  } else if (target.kind === 'screen') {
    const screen = find(screens, target.screenId);
    if (!screen || !setScreen(screen)) return null;
    if (result.relatedItemIds.length === 1) result.itemId = result.relatedItemIds[0];
    result.target = { kind: 'screen', screenId: screen.id };
    result.label = screen.title ?? null;
  } else if (target.kind === 'outcome' || target.kind === 'layer') {
    const item = find(items, target.itemId);
    if (!item || !setItem(item)) return null;
    const outcomes = list(item.step?.outcomes);
    let index = target.outcomeIndex, entry = null, layer = null;
    if (target.kind === 'layer') {
      if (typeof target.entryId !== 'string' || !target.entryId) return null;
      const matches = [];
      outcomes.forEach((outcome, outcomeIndex) => {
        for (const key of ['system', 'data']) for (const candidate of list(outcome?.[key]))
          if (candidate?.id === target.entryId) matches.push({ entry: candidate, layer: key, index: outcomeIndex });
      });
      if (matches.length !== 1) return null;
      ({ index, entry, layer } = matches[0]);
    }
    if (!Number.isInteger(index) || index < 0 || index >= outcomes.length) return null;
    const outcome = outcomes[index], screen = find(screens, outcome?.to);
    if (!screen) return null;
    result.screenId = screen.id;
    result.outcomeIndex = index;
    if (entry) {
      result.target = { kind: 'layer', itemId: item.id, entryId: entry.id };
      result.layerKey = `${item.id}/${entry.id}`;
      result.label = (layer === 'system' ? entry.name : entry.entity) ?? null;
    } else {
      result.target = { kind: 'outcome', itemId: item.id, outcomeIndex: index };
      result.label = (outcome.label || outcome.effect) ?? null;
    }
  } else if (target.kind === 'node' || target.kind === 'edge') {
    const diagram = find(review.diagrams, target.diagramId);
    if (!diagram) return null;
    result.diagramId = diagram.id;
    if (target.kind === 'node') {
      const node = find(diagram.nodes, target.nodeId);
      if (!node) return null;
      if (node.step !== undefined) {
        const item = find(items, node.step);
        if (!item || !setItem(item)) return null;
      } else if (diagram.id === 'user-flow' && node.id.startsWith('screen:')) {
        const screen = find(screens, node.id.slice('screen:'.length));
        if (!screen || !setScreen(screen)) return null;
      }
      result.target = { kind: 'node', diagramId: diagram.id, nodeId: node.id };
      result.label = node.label ?? null;
      result.commentTarget = { node: node.id };
    } else {
      const from = find(diagram.nodes, target.from), to = find(diagram.nodes, target.to);
      if (!from || !to) return null;
      const edges = list(diagram.edges);
      let edge;
      const on = { from: from.id, to: to.id };
      if (target.nth !== undefined) {
        if (!Number.isInteger(target.nth) || target.nth < 0 || target.nth >= edges.length) return null;
        edge = edges[target.nth];
        on.nth = target.nth;
      } else {
        const matches = edges.filter(candidate => candidate?.from === from.id && candidate?.to === to.id);
        if (matches.length !== 1) return null;
        edge = matches[0];
      }
      if (!edge || edge.from !== from.id || edge.to !== to.id) return null;
      result.target = { kind: 'edge', diagramId: diagram.id, ...on };
      result.commentTarget = { edge: on };
      if (diagram.kind === 'database') {
        if (!find(from.columns, edge.fromColumn) || !find(to.columns, edge.toColumn)) return null;
        result.label = `${from.label}.${edge.fromColumn} (many) → ${to.label}.${edge.toColumn} (one)`;
      } else result.label = `${from.label} → ${to.label}`;
      if (edge.label) result.label += ` (${edge.label})`;
    }
  } else return null;
  return result;
}
