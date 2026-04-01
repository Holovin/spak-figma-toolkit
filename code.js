// Capitalize first letter of each word
function capitalizeWords(str) {
  if (!str) return str;
  return str.split(' ').map(word => {
    const cp = [...word];
    if (!cp.length) return word;
    return cp[0].toUpperCase() + cp.slice(1).join('').toLowerCase();
  }).join(' ');
}

// Sorting priorities
const THEME_PRIORITY = ['light', 'dark', 'dark1', 'dark2'];
const STATE_PRIORITY = ['on', 'off', 'default', 'blue', 'darkblue', 'grey', 'lightgrey', 'white', 'black', 'green', 'red', 'purple'];

function sortByPriority(items, priorityList) {
  return [...items].sort((a, b) => {
    const aIndex = priorityList.indexOf(a);
    const bIndex = priorityList.indexOf(b);
    
    // Both in priority list
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    // Only a in list
    if (aIndex !== -1) return -1;
    // Only b in list
    if (bIndex !== -1) return 1;
    // Neither in list - sort alphabetically
    return a.localeCompare(b);
  });
}

// Send log message to UI
function log(message, level = '') {
  figma.ui.postMessage({ type: 'log', message, level });
}

// Cache of existing components on page
let existingComponentNames = new Set();

function scanExistingComponents() {
  existingComponentNames.clear();

  const nodes = figma.currentPage.findAll(node =>
    node.type === 'COMPONENT_SET' || node.type === 'COMPONENT'
  );

  for (const node of nodes) {
    if (node.type === 'COMPONENT_SET') {
      existingComponentNames.add(node.name);
    } else if (node.parent === figma.currentPage || (node.parent && node.parent.type !== 'COMPONENT_SET')) {
      existingComponentNames.add(node.name);
    }
  }

  return existingComponentNames.size;
}

function isComponentExists(name) {
  return existingComponentNames.has(name);
}

// Show UI
figma.showUI(__html__, { width: 440, height: 560, title: 'SPAK Figma Toolkit v0.7' });

function sendPageInfo() {
  figma.ui.postMessage({ type: 'page-info', name: figma.currentPage.name });
}

// Send selection info to UI
function sendSelectionInfo() {
  const sel = figma.currentPage.selection;
  const names = sel.map(n => n.name);
  figma.ui.postMessage({ type: 'selection-info', count: sel.length, names });
}

function refreshPageContext() {
  sendPageInfo();
  sendSelectionInfo();
  const count = scanExistingComponents();
  log(`Page changed: ${figma.currentPage.name} (${count} existing components on page)`, 'info');
}

sendPageInfo();
sendSelectionInfo();

figma.on('selectionchange', sendSelectionInfo);
figma.on('currentpagechange', refreshPageContext);

// Scan existing components on startup
const existingCount = scanExistingComponents();
log(`Found ${existingCount} existing components on page`, 'info');

// Constraint editing
let pendingConstraintLayers = [];
let pendingIconTargets = [];

function getNodePath(node, rootNode) {
  const parts = [];
  let current = node;
  while (current && current.id !== rootNode.id) {
    parts.unshift(current.name);
    current = current.parent;
  }
  parts.unshift(rootNode.name);
  return parts.join(' / ');
}

function findDeepestConstrainableLayers(rootNode) {
  function getMaxDepth(node, depth) {
    if (!('children' in node) || node.children.length === 0) return depth;
    let maxD = depth;
    for (const child of node.children) {
      maxD = Math.max(maxD, getMaxDepth(child, depth + 1));
    }
    return maxD;
  }

  const maxDepth = getMaxDepth(rootNode, 0);

  function collectAtDepth(node, depth) {
    if (depth === maxDepth) {
      if ('constraints' in node) return [node];
      return [];
    }
    if (!('children' in node)) return [];
    let result = [];
    for (const child of node.children) {
      result = result.concat(collectAtDepth(child, depth + 1));
    }
    return result;
  }

  return collectAtDepth(rootNode, 0);
}

function collectConstraintTargetsFromSelection() {
  const selection = figma.currentPage.selection;
  const targets = [];

  for (const selNode of selection) {
    const layers = findDeepestConstrainableLayers(selNode);
    for (const layer of layers) {
      targets.push({ node: layer, path: getNodePath(layer, selNode) });
    }
  }

  return targets;
}

function getCommonConstraintValues(targets) {
  if (!targets.length) {
    return { currentX: '', currentY: '' };
  }

  const firstConstraints = targets[0].node.constraints || {};
  const firstX = firstConstraints.horizontal || '';
  const firstY = firstConstraints.vertical || '';
  let sameX = !!firstX;
  let sameY = !!firstY;

  for (let i = 1; i < targets.length; i++) {
    const constraints = targets[i].node.constraints || {};
    if (constraints.horizontal !== firstX) sameX = false;
    if (constraints.vertical !== firstY) sameY = false;
    if (!sameX && !sameY) break;
  }

  return {
    currentX: sameX ? firstX : '',
    currentY: sameY ? firstY : '',
  };
}

function getIconSourceName(node) {
  if (node.type !== 'INSTANCE' || !node.mainComponent) return null;

  const parent = node.mainComponent.parent;
  if (parent && parent.type === 'COMPONENT_SET') {
    return parent.name;
  }

  return node.mainComponent.name;
}

function getVariantOptions(node) {
  const themes = new Set();
  const states = new Set();
  let themeKey = '';
  let stateKey = '';

  function collectMatchingProps(props) {
    for (const key in props) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'theme') {
        themeKey = themeKey || key;
        if (props[key]) themes.add(props[key]);
      } else if (normalizedKey === 'state') {
        stateKey = stateKey || key;
        if (props[key]) states.add(props[key]);
      }
    }
  }

  if (node.type !== 'INSTANCE' || !node.mainComponent) {
    return { themes, states, themeKey, stateKey };
  }

  const parent = node.mainComponent.parent;
  if (parent && parent.type === 'COMPONENT_SET') {
    for (const variant of parent.children) {
      const props = variant.variantProperties || {};
      collectMatchingProps(props);
    }
  } else {
    const props = node.variantProperties || node.mainComponent.variantProperties || {};
    collectMatchingProps(props);
  }

  return { themes, states, themeKey, stateKey };
}

function findEditableIconTargets(rootNode, prefix) {
  const result = [];

  function visit(node) {
    if (node.type === 'INSTANCE') {
      const sourceName = getIconSourceName(node);
      if (sourceName && sourceName.startsWith(prefix)) {
        const componentProps = node.mainComponent ? node.mainComponent.variantProperties : null;
        const props = node.variantProperties || componentProps || {};
        const options = getVariantOptions(node);
        const currentTheme = options.themeKey ? (props[options.themeKey] || '') : '';
        const currentState = options.stateKey ? (props[options.stateKey] || '') : '';
        const displayName = sourceName.slice(prefix.length) || sourceName;

        result.push({
          node,
          path: getNodePath(node, rootNode),
          sourceName,
          displayName,
          currentTheme,
          currentState,
          themeKey: options.themeKey,
          stateKey: options.stateKey,
          availableThemes: [...options.themes],
          availableStates: [...options.states],
        });
      }
    }

    if ('children' in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  visit(rootNode);
  return result;
}

function buildOptionList(targets, key, priorityList) {
  const counts = new Map();

  for (const target of targets) {
    for (const value of target[key]) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }

  return sortByPriority([...counts.keys()], priorityList).map(value => ({
    value,
    enabled: counts.get(value) === targets.length,
    count: counts.get(value),
  }));
}

function parseExcludePrefixes(excludePrefixText) {
  return excludePrefixText
    .split(',')
    .map(prefix => prefix.trim())
    .filter(Boolean);
}

function collectIconTargetsFromSelection(includePrefix, excludePrefixText) {
  const selection = figma.currentPage.selection;
  const targets = [];
  const seen = new Set();
  const excludePrefixes = parseExcludePrefixes(excludePrefixText || '');

  for (const selNode of selection) {
    const matches = findEditableIconTargets(selNode, includePrefix);
    for (const target of matches) {
      if (seen.has(target.node.id)) continue;
      if (excludePrefixes.some(prefix => target.sourceName.startsWith(prefix))) continue;
      seen.add(target.node.id);
      targets.push(target);
    }
  }

  return targets;
}

function sendIconScanResult(targets) {
  const themeOptions = buildOptionList(targets, 'availableThemes', THEME_PRIORITY);
  const stateOptions = buildOptionList(targets, 'availableStates', STATE_PRIORITY);
  const currentThemes = [...new Set(targets.map(target => target.currentTheme).filter(Boolean))];
  const currentStates = [...new Set(targets.map(target => target.currentState).filter(Boolean))];
  const currentTheme = currentThemes.length === 1 ? currentThemes[0] : '';
  const currentState = currentStates.length === 1 ? currentStates[0] : '';
  const themeGroupsMap = new Map();
  const stateGroupsMap = new Map();

  for (const target of targets) {
    if (target.currentTheme) {
      if (!themeGroupsMap.has(target.currentTheme)) {
        themeGroupsMap.set(target.currentTheme, new Set());
      }
      themeGroupsMap.get(target.currentTheme).add(target.displayName);
    }

    if (!target.currentState) continue;
    if (!stateGroupsMap.has(target.currentState)) {
      stateGroupsMap.set(target.currentState, new Set());
    }
    stateGroupsMap.get(target.currentState).add(target.displayName);
  }

  const themeGroups = sortByPriority([...themeGroupsMap.keys()], THEME_PRIORITY).map(theme => ({
    value: theme,
    names: [...themeGroupsMap.get(theme)].sort((a, b) => a.localeCompare(b)),
  }));

  const stateGroups = sortByPriority([...stateGroupsMap.keys()], STATE_PRIORITY).map(state => ({
    value: state,
    names: [...stateGroupsMap.get(state)].sort((a, b) => a.localeCompare(b)),
  }));

  figma.ui.postMessage({
    type: 'icon-props-scanned',
    count: targets.length,
    themeOptions,
    stateOptions,
    themeGroups,
    stateGroups,
    currentTheme,
    currentState,
  });
}

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'rescan-components') {
    const count = scanExistingComponents();
    log(`Rescanned: ${count} existing components on page`, 'info');
    figma.ui.postMessage({ type: 'rescan-done' });
  } else if (msg.type === 'create-icon') {
    await createIconComponent(msg);
  } else if (msg.type === 'scan-constraints') {
    const targets = figma.currentPage.selection.length === 0 ? [] : collectConstraintTargetsFromSelection();
    const currentValues = getCommonConstraintValues(targets);
    figma.ui.postMessage({
      type: 'constraints-scanned',
      count: targets.length,
      currentX: currentValues.currentX,
      currentY: currentValues.currentY,
    });
  } else if (msg.type === 'preview-constraints') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      log('No layers selected', 'warn');
      figma.ui.postMessage({ type: 'constraints-preview', count: 0, paths: [] });
      return;
    }

    pendingConstraintLayers = collectConstraintTargetsFromSelection();

    const paths = pendingConstraintLayers.map(l => l.path);
    log(`\n🔍 Preview: scanning ${selection.length} selected elements...`, 'info');
    figma.ui.postMessage({ type: 'constraints-preview', count: pendingConstraintLayers.length, paths });

  } else if (msg.type === 'apply-constraints') {
    const total = pendingConstraintLayers.length;
    let errors = 0;

    log(`\n▶ Applying constraints (X: ${msg.x}, Y: ${msg.y}) to ${total} layers...`, 'info');

    for (let i = 0; i < total; i++) {
      const { node, path } = pendingConstraintLayers[i];
      try {
        node.constraints = { horizontal: msg.x, vertical: msg.y };
        log(`  ✓ ${path}`, 'success');
      } catch (err) {
        errors++;
        log(`  ✗ ${path}: ${err.message}`, 'error');
      }
      figma.ui.postMessage({ type: 'constraint-progress', current: i + 1, total, errors });
      if (i < total - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    pendingConstraintLayers = [];
    figma.ui.postMessage({ type: 'constraints-done', total, errors });

  } else if (msg.type === 'cancel-constraints') {
    pendingConstraintLayers = [];
  } else if (msg.type === 'scan-icon-props') {
    const includePrefix = msg.includePrefix || '';
    const excludePrefix = msg.excludePrefix || '';
    if (includePrefix.trim() === '' || figma.currentPage.selection.length === 0) {
      figma.ui.postMessage({ type: 'icon-props-scanned', count: 0, themeOptions: [], stateOptions: [] });
      return;
    }

    sendIconScanResult(collectIconTargetsFromSelection(includePrefix, excludePrefix));
  } else if (msg.type === 'preview-icon-props') {
    const includePrefix = msg.includePrefix || '';
    const excludePrefix = msg.excludePrefix || '';
    const excludePrefixes = parseExcludePrefixes(excludePrefix);
    if (includePrefix.trim() === '') {
      log('Include prefix is empty', 'warn');
      figma.ui.postMessage({ type: 'icon-props-preview', count: 0 });
      return;
    }

    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      log('No layers selected', 'warn');
      figma.ui.postMessage({ type: 'icon-props-preview', count: 0 });
      return;
    }

    log(`\n🔍 Preview: scanning ${selection.length} selected elements for icons starting with "${includePrefix}"...`, 'info');
    if (excludePrefixes.length > 0) {
      log(`  Excluding icons starting with: ${excludePrefixes.join(', ')}`, 'info');
    }
    pendingIconTargets = collectIconTargetsFromSelection(includePrefix, excludePrefix);

    if (pendingIconTargets.length === 0) {
      log(`No matching icon instances found for include/exclude filters`, 'warn');
      figma.ui.postMessage({ type: 'icon-props-preview', count: 0 });
      return;
    }

    for (const target of pendingIconTargets) {
      const themeText = target.currentTheme || '—';
      const stateText = target.currentState || '—';
      log(`  ✓ ${target.path} → ${target.displayName} (theme=${themeText}, state=${stateText})`, 'success');
    }

    const themeOptions = buildOptionList(pendingIconTargets, 'availableThemes', THEME_PRIORITY);
    const stateOptions = buildOptionList(pendingIconTargets, 'availableStates', STATE_PRIORITY);

    if (themeOptions.length > 0) {
      log(`Theme options: ${themeOptions.map(opt => opt.enabled ? opt.value : `${opt.value} (partial)`).join(', ')}`, 'info');
    } else {
      log('Theme property not found on matched icons', 'warn');
    }

    if (stateOptions.length > 0) {
      log(`State options: ${stateOptions.map(opt => opt.enabled ? opt.value : `${opt.value} (partial)`).join(', ')}`, 'info');
    } else {
      log('State property not found on matched icons', 'warn');
    }

    figma.ui.postMessage({
      type: 'icon-props-preview',
      count: pendingIconTargets.length,
    });
  } else if (msg.type === 'apply-icon-props') {
    const total = pendingIconTargets.length;

    if (total === 0) {
      log('No icon preview is ready', 'warn');
      figma.ui.postMessage({ type: 'icon-props-done', total: 0, errors: 0 });
      return;
    }

    if (!msg.theme && !msg.state) {
      log('Choose theme and/or state before applying', 'warn');
      figma.ui.postMessage({ type: 'icon-props-done', total: 0, errors: 0, skipped: true });
      return;
    }

    const updateParts = [];
    if (msg.theme) updateParts.push(`theme=${msg.theme}`);
    if (msg.state) updateParts.push(`state=${msg.state}`);

    let errors = 0;
    log(`\n▶ Applying icon props (${updateParts.join(', ')}) to ${total} icons...`, 'info');

    for (let i = 0; i < total; i++) {
      const target = pendingIconTargets[i];
      try {
        const updates = {};
        if (msg.theme && target.themeKey) updates[target.themeKey] = msg.theme;
        if (msg.state && target.stateKey) updates[target.stateKey] = msg.state;

        if (Object.keys(updates).length === 0) {
          throw new Error('No matching variant properties found');
        }

        target.node.setProperties(updates);
        log(`  ✓ ${target.path}`, 'success');
      } catch (err) {
        errors++;
        log(`  ✗ ${target.path}: ${err.message}`, 'error');
      }

      figma.ui.postMessage({ type: 'icon-props-progress', current: i + 1, total, errors });
      if (i < total - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    pendingIconTargets = [];
    figma.ui.postMessage({ type: 'icon-props-done', total, errors });
  } else if (msg.type === 'cancel-icon-props') {
    pendingIconTargets = [];
  }
};

function createVariantNode(variant, iconWidth, iconHeight, noThemes, onlyDefaultState, theme, state) {
  const varWidth = variant.displayWidth || iconWidth;
  const varHeight = variant.displayHeight || iconHeight;
  const component = figma.createComponent();

  if (noThemes && onlyDefaultState) {
    component.name = 'default';
  } else if (noThemes) {
    component.name = `state=${state}`;
  } else if (onlyDefaultState) {
    component.name = `theme=${theme}`;
  } else {
    component.name = `theme=${theme}, state=${state}`;
  }

  component.resize(varWidth, varHeight);

  const rect = figma.createRectangle();
  rect.resize(varWidth, varHeight);
  rect.x = 0;
  rect.y = 0;

  if (variant.isMissing) {
    rect.fills = [{ type: 'SOLID', color: { r: 0xF7 / 255, g: 0x00 / 255, b: 0xFF / 255 } }];
    rect.name = 'missing-placeholder';
  } else {
    const image = figma.createImage(new Uint8Array(variant.bytes));
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    rect.name = 'icon';
  }

  component.appendChild(rect);
  return component;
}

function configureComponentSet(componentSet, createdVariants, sortedThemes, sortedStates, noThemes, onlyDefaultState, hasAnyProblems) {
  const gap = 20;

  componentSet.layoutMode = 'GRID';

  if (noThemes) {
    componentSet.gridRowCount = sortedStates.length;
    componentSet.gridColumnCount = 1;
  } else if (onlyDefaultState) {
    componentSet.gridRowCount = 1;
    componentSet.gridColumnCount = sortedThemes.length;
  } else {
    componentSet.gridRowCount = sortedStates.length;
    componentSet.gridColumnCount = sortedThemes.length;
  }

  componentSet.gridRowGap = gap;
  componentSet.gridColumnGap = gap;
  componentSet.paddingLeft = gap;
  componentSet.paddingRight = gap;
  componentSet.paddingTop = gap;
  componentSet.paddingBottom = gap;
  componentSet.layoutSizingHorizontal = 'HUG';
  componentSet.layoutSizingVertical = 'HUG';

  for (const v of createdVariants) {
    v.component.setGridChildPosition(v.stateIndex, v.themeIndex);
  }

  const strokeColor = hasAnyProblems
    ? { r: 1, g: 1, b: 0 }
    : { r: 0x8A / 255, g: 0x38 / 255, b: 0xF5 / 255 };

  componentSet.strokes = [{ type: 'SOLID', color: strokeColor }];
  componentSet.strokeWeight = 1;
  componentSet.strokeAlign = 'INSIDE';
  componentSet.dashPattern = [10, 5];
}

async function createIconComponent({ category, name, themes, states, variants, position, hasProblems, iconWidth, iconHeight, onlyDefaultState, noThemes }) {
  const sizeSuffix = (iconWidth !== iconHeight) ? ` ${iconWidth}x${iconHeight}` : '';
  const componentName = `Icon / ${capitalizeWords(category)} / ${capitalizeWords(name)}${sizeSuffix}`;

  if (isComponentExists(componentName)) {
    log(`⏭️ Skipped (already exists): ${componentName}`, 'warn');
    figma.ui.postMessage({ type: 'component-created', width: 0, height: 0, skipped: true });
    return;
  }

  log(`Creating: ${componentName}`, 'info');

  const sortedThemes = noThemes ? ['light'] : sortByPriority(themes, THEME_PRIORITY);
  const allStates = [...new Set(variants.map(v => v.state))];
  const sortedStates = sortByPriority(allStates, STATE_PRIORITY);

  if (noThemes) {
    log(`  Themes: none (on/off pattern, light only)`, 'info');
  } else {
    log(`  Themes (sorted): ${sortedThemes.join(', ')}`, 'info');
  }
  log(`  States: ${!onlyDefaultState ? sortedStates.join(', ') : 'none (only default)'}`, 'info');

  let creationProblems = false;
  const createdVariants = [];

  for (let themeIndex = 0; themeIndex < sortedThemes.length; themeIndex++) {
    const theme = sortedThemes[themeIndex];
    for (let stateIndex = 0; stateIndex < sortedStates.length; stateIndex++) {
      const state = sortedStates[stateIndex];
      const variant = variants.find(v => v.theme === theme && v.state === state);

      if (!variant) {
        log(`Variant not found: ${theme}/${state}`, 'error');
        creationProblems = true;
        continue;
      }

      try {
        if (variant.isMissing) creationProblems = true;
        const component = createVariantNode(variant, iconWidth, iconHeight, noThemes, onlyDefaultState, theme, state);
        createdVariants.push({ component, themeIndex, stateIndex });
      } catch (err) {
        creationProblems = true;
        log(`Error creating variant ${theme}/${state}: ${err.message} (${err.name})`, 'error');
      }
    }
  }

  const hasAnyProblems = hasProblems || creationProblems;

  if (createdVariants.length === 0) {
    log(`No variants for ${componentName}`, 'error');
    figma.ui.postMessage({ type: 'component-created', width: 0, height: 0 });
    return;
  }

  let finalWidth = 0;
  let finalHeight = 0;

  if (createdVariants.length === 1) {
    const comp = createdVariants[0].component;
    comp.name = componentName;
    comp.x = position.x;
    comp.y = position.y;
    finalWidth = iconWidth;
    finalHeight = iconHeight;
    existingComponentNames.add(componentName);
    log(`Created component (1 variant): ${componentName}`, 'success');
  } else {
    try {
      const components = createdVariants.map(v => v.component);
      const componentSet = figma.combineAsVariants(components, figma.currentPage);
      componentSet.name = componentName;

      configureComponentSet(componentSet, createdVariants, sortedThemes, sortedStates, noThemes, onlyDefaultState, hasAnyProblems);

      componentSet.x = position.x;
      componentSet.y = position.y;
      finalWidth = componentSet.width;
      finalHeight = componentSet.height;
      existingComponentNames.add(componentName);

      let variantInfo = '';
      if (noThemes && !onlyDefaultState) {
        variantInfo = `${sortedStates.length} states`;
      } else if (!noThemes && onlyDefaultState) {
        variantInfo = `${sortedThemes.length} themes`;
      } else {
        variantInfo = `${sortedThemes.length} themes × ${sortedStates.length} states`;
      }
      log(`Created Component Set: ${componentName} (${createdVariants.length} variants, ${variantInfo})`, 'success');
    } catch (err) {
      log(`Error creating Component Set: ${err.message} (${err.name})`, 'error');
      const gap = 20;
      createdVariants.forEach((v, i) => {
        v.component.name = `${componentName} / ${v.component.name}`;
        v.component.x = position.x + i * (iconWidth + gap);
        v.component.y = position.y;
      });
      finalWidth = createdVariants.length * (iconWidth + gap);
      finalHeight = iconHeight;
    }
  }

  figma.ui.postMessage({ type: 'component-created', width: finalWidth, height: finalHeight });
}
