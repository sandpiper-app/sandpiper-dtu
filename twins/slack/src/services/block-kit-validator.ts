/**
 * Block Kit Validator for Slack Web API
 *
 * Validates Block Kit block arrays for structural correctness and count limits.
 * Messages: max 50 blocks. Modals: max 100 blocks.
 */

export interface BlockValidationResult {
  valid: boolean;
  error?: string;
}

/** Valid block types for message surface */
const VALID_MESSAGE_BLOCK_TYPES = new Set([
  'section',
  'divider',
  'image',
  'actions',
  'context',
  'header',
  'rich_text',
  'video',
  'file',
]);

/**
 * Validate a Block Kit blocks array.
 *
 * @param blocks - Array of block objects
 * @param surface - Surface type (message or modal), defaults to 'message'
 * @returns Validation result with optional error code
 */
export function validateBlocks(
  blocks: unknown[],
  surface: 'message' | 'modal' = 'message'
): BlockValidationResult {
  // Check that blocks is actually an array
  if (!Array.isArray(blocks)) {
    return { valid: false, error: 'invalid_blocks_format' };
  }

  // Check each block has a type property
  for (const block of blocks) {
    if (
      typeof block !== 'object' ||
      block === null ||
      !('type' in block) ||
      typeof (block as any).type !== 'string'
    ) {
      return { valid: false, error: 'invalid_blocks_format' };
    }
    // Accept unknown types for forward compatibility — don't validate type names
  }

  // Check block count limits
  const maxBlocks = surface === 'modal' ? 100 : 50;
  if (blocks.length > maxBlocks) {
    return { valid: false, error: 'invalid_blocks' };
  }

  return { valid: true };
}
