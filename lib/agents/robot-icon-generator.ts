/**
 * Pixel Art Robot Icon Generator
 *
 * Generates unique SVG robot icons in pixel-art style for AI agents.
 * Each robot has variations in shape, color, and accessories.
 */

export interface RobotIconConfig {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  eyeStyle: 'round' | 'square' | 'line' | 'visor';
  antennaStyle: 'single' | 'double' | 'spring' | 'none';
  bodyShape: 'square' | 'rounded' | 'tall' | 'wide';
}

/**
 * Color palettes for robot variants
 */
const ROBOT_COLORS = {
  blue: { primary: '#58a6ff', secondary: '#1f6feb' },
  green: { primary: '#3fb950', secondary: '#238636' },
  purple: { primary: '#bc8cff', secondary: '#8957e5' },
  orange: { primary: '#f0883e', secondary: '#db6d28' },
  red: { primary: '#ff7b72', secondary: '#da3633' },
  yellow: { primary: '#ffd43b', secondary: '#f0c020' },
  cyan: { primary: '#76e3ea', secondary: '#39c5cf' },
  pink: { primary: '#ff9ff3', secondary: '#dd72ed' },
};

/**
 * Generate a unique robot icon configuration from an agent ID
 */
export function generateRobotConfig(agentId: string): RobotIconConfig {
  // Use agent ID to deterministically generate appearance
  const hash = simpleHash(agentId);
  const colorKeys = Object.keys(ROBOT_COLORS);
  const colorIndex = hash % colorKeys.length;
  const colorKey = colorKeys[colorIndex];
  const colors = ROBOT_COLORS[colorKey as keyof typeof ROBOT_COLORS];

  const eyeStyles: RobotIconConfig['eyeStyle'][] = ['round', 'square', 'line', 'visor'];
  const antennaStyles: RobotIconConfig['antennaStyle'][] = ['single', 'double', 'spring', 'none'];
  const bodyShapes: RobotIconConfig['bodyShape'][] = ['square', 'rounded', 'tall', 'wide'];

  return {
    id: agentId,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    eyeStyle: eyeStyles[(hash >> 2) % eyeStyles.length],
    antennaStyle: antennaStyles[(hash >> 4) % antennaStyles.length],
    bodyShape: bodyShapes[(hash >> 6) % bodyShapes.length],
  };
}

/**
 * Simple hash function for deterministic randomization
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate pixel-art robot SVG
 */
export function generateRobotSVG(config: RobotIconConfig, size: number = 32): string {
  const pixelSize = size / 8; // 8x8 pixel grid

  // Generate body based on shape
  const body = generateBody(config.bodyShape, pixelSize, config.primaryColor, config.secondaryColor);

  // Generate eyes based on style
  const eyes = generateEyes(config.eyeStyle, pixelSize, config.secondaryColor);

  // Generate antenna based on style
  const antenna = generateAntenna(config.antennaStyle, pixelSize, config.primaryColor);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <g>
    ${body}
    ${eyes}
    ${antenna}
  </g>
</svg>`;
}

function generateBody(shape: RobotIconConfig['bodyShape'], px: number, primary: string, secondary: string): string {
  switch (shape) {
    case 'square':
      return `
    <!-- Square body -->
    <rect x="${px * 1}" y="${px * 2}" width="${px * 6}" height="${px * 5}" fill="${primary}" />
    <rect x="${px * 2}" y="${px * 3}" width="${px * 4}" height="${px * 3}" fill="${secondary}" />
  `;
    case 'rounded':
      return `
    <!-- Rounded body -->
    <rect x="${px * 1}" y="${px * 2}" width="${px * 6}" height="${px * 5}" rx="${px}" fill="${primary}" />
    <rect x="${px * 2}" y="${px * 3}" width="${px * 4}" height="${px * 3}" rx="${px * 0.5}" fill="${secondary}" />
  `;
    case 'tall':
      return `
    <!-- Tall body -->
    <rect x="${px * 2}" y="${px * 1}" width="${px * 4}" height="${px * 6}" fill="${primary}" />
    <rect x="${px * 2.5}" y="${px * 2}" width="${px * 3}" height="${px * 4}" fill="${secondary}" />
  `;
    case 'wide':
      return `
    <!-- Wide body -->
    <rect x="${px * 0.5}" y="${px * 2.5}" width="${px * 7}" height="${px * 4}" fill="${primary}" />
    <rect x="${px * 1.5}" y="${px * 3}" width="${px * 5}" height="${px * 3}" fill="${secondary}" />
  `;
  }
}

function generateEyes(style: RobotIconConfig['eyeStyle'], px: number, color: string): string {
  switch (style) {
    case 'round':
      return `
    <!-- Round eyes -->
    <circle cx="${px * 2.5}" cy="${px * 3.5}" r="${px * 0.5}" fill="${color}" />
    <circle cx="${px * 5.5}" cy="${px * 3.5}" r="${px * 0.5}" fill="${color}" />
  `;
    case 'square':
      return `
    <!-- Square eyes -->
    <rect x="${px * 2}" y="${px * 3}" width="${px}" height="${px}" fill="${color}" />
    <rect x="${px * 5}" y="${px * 3}" width="${px}" height="${px}" fill="${color}" />
  `;
    case 'line':
      return `
    <!-- Line eyes -->
    <rect x="${px * 2}" y="${px * 3.5}" width="${px * 1.5}" height="${px * 0.3}" fill="${color}" />
    <rect x="${px * 4.5}" y="${px * 3.5}" width="${px * 1.5}" height="${px * 0.3}" fill="${color}" />
  `;
    case 'visor':
      return `
    <!-- Visor eye -->
    <rect x="${px * 1.5}" y="${px * 3.5}" width="${px * 5}" height="${px * 0.5}" fill="${color}" />
  `;
  }
}

function generateAntenna(style: RobotIconConfig['antennaStyle'], px: number, color: string): string {
  switch (style) {
    case 'single':
      return `
    <!-- Single antenna -->
    <rect x="${px * 3.5}" y="${px * 0.5}" width="${px * 0.5}" height="${px * 1.5}" fill="${color}" />
    <circle cx="${px * 3.75}" cy="${px * 0.5}" r="${px * 0.4}" fill="${color}" />
  `;
    case 'double':
      return `
    <!-- Double antenna -->
    <rect x="${px * 2.5}" y="${px * 0.5}" width="${px * 0.5}" height="${px * 1.5}" fill="${color}" />
    <circle cx="${px * 2.75}" cy="${px * 0.5}" r="${px * 0.4}" fill="${color}" />
    <rect x="${px * 5}" y="${px * 0.5}" width="${px * 0.5}" height="${px * 1.5}" fill="${color}" />
    <circle cx="${px * 5.25}" cy="${px * 0.5}" r="${px * 0.4}" fill="${color}" />
  `;
    case 'spring':
      return `
    <!-- Spring antenna -->
    <path d="M ${px * 4} ${px * 2} Q ${px * 3.5} ${px * 1.5} ${px * 4} ${px * 1} Q ${px * 4.5} ${px * 0.5} ${px * 4} ${px * 0}"
          stroke="${color}" stroke-width="${px * 0.3}" fill="none" />
    <circle cx="${px * 4}" cy="${px * 0}" r="${px * 0.4}" fill="${color}" />
  `;
    case 'none':
      return '';
  }
}

/**
 * Generate LLMos logo - the main pixel-art robot mascot
 */
export function generateLLMosLogo(size: number = 64): string {
  const px = size / 16; // 16x16 pixel grid for more detail

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <g>
    <!-- Head -->
    <rect x="${px * 4}" y="${px * 2}" width="${px * 8}" height="${px * 6}" fill="#58a6ff" rx="${px * 0.5}" />

    <!-- Visor/Eyes -->
    <rect x="${px * 5}" y="${px * 4}" width="${px * 6}" height="${px * 1.5}" fill="#1f6feb" rx="${px * 0.3}" />
    <rect x="${px * 6}" y="${px * 4.3}" width="${px * 1.5}" height="${px * 0.8}" fill="#76e3ea" />
    <rect x="${px * 8.5}" y="${px * 4.3}" width="${px * 1.5}" height="${px * 0.8}" fill="#76e3ea" />

    <!-- Antenna -->
    <rect x="${px * 7.5}" y="${px * 0.5}" width="${px * 1}" height="${px * 1.5}" fill="#ff7b72" />
    <circle cx="${px * 8}" cy="${px * 0.5}" r="${px * 0.6}" fill="#ff7b72" />

    <!-- Body -->
    <rect x="${px * 3}" y="${px * 8}" width="${px * 10}" height="${px * 6}" fill="#3fb950" rx="${px * 0.5}" />
    <rect x="${px * 5}" y="${px * 9}" width="${px * 6}" height="${px * 4}" fill="#238636" rx="${px * 0.3}" />

    <!-- Arms -->
    <rect x="${px * 1}" y="${px * 9}" width="${px * 2}" height="${px * 4}" fill="#58a6ff" rx="${px * 0.3}" />
    <rect x="${px * 13}" y="${px * 9}" width="${px * 2}" height="${px * 4}" fill="#58a6ff" rx="${px * 0.3}" />

    <!-- Legs -->
    <rect x="${px * 5}" y="${px * 14}" width="${px * 2.5}" height="${px * 2}" fill="#1f6feb" />
    <rect x="${px * 8.5}" y="${px * 14}" width="${px * 2.5}" height="${px * 2}" fill="#1f6feb" />

    <!-- Highlight -->
    <rect x="${px * 4.5}" y="${px * 2.5}" width="${px * 1}" height="${px * 1}" fill="#76e3ea" opacity="0.6" />
  </g>
</svg>`;
}

/**
 * Export robot icon as data URL for use in img src
 */
export function robotIconToDataURL(config: RobotIconConfig, size?: number): string {
  const svg = generateRobotSVG(config, size);
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Export LLMos logo as data URL
 */
export function llmosLogoToDataURL(size?: number): string {
  const svg = generateLLMosLogo(size);
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}
