// Capitalize first letter utility
function capitalize(str) {
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
  
  // Find all ComponentSets on current page
  const componentSets = figma.currentPage.findAllWithCriteria({
    types: ['COMPONENT_SET']
  });
  
  for (const cs of componentSets) {
    existingComponentNames.add(cs.name);
  }
  
  // Also find standalone components (for single-variant icons)
  const components = figma.currentPage.findAllWithCriteria({
    types: ['COMPONENT']
  });
  
  for (const c of components) {
    // Only top-level components (not inside ComponentSet)
    if (c.parent === figma.currentPage || (c.parent && c.parent.type !== 'COMPONENT_SET')) {
      existingComponentNames.add(c.name);
    }
  }
  
  return existingComponentNames.size;
}

function isComponentExists(name) {
  return existingComponentNames.has(name);
}

// Show UI
figma.showUI(__html__, { width: 440, height: 520, title: 'Icon Importer v0.51' });

// Send current page name to UI
figma.ui.postMessage({ type: 'page-info', name: figma.currentPage.name });

// Scan existing components on startup
const existingCount = scanExistingComponents();
log(`Found ${existingCount} existing components on page`, 'info');

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'rescan-components') {
    const count = scanExistingComponents();
    log(`Rescanned: ${count} existing components on page`, 'info');
    figma.ui.postMessage({ type: 'rescan-done' });
  } else if (msg.type === 'create-icon') {
    await createIconComponent(msg);
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
  const componentName = `Icon / ${capitalize(category)} / ${capitalize(name)}${sizeSuffix}`;

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
