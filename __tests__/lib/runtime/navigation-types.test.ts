import {
  validateNavigationDecision,
  parseNavigationDecision,
} from '../../../lib/runtime/navigation-types';

// =============================================================================
// Validation
// =============================================================================

describe('validateNavigationDecision', () => {
  const validDecision = {
    action: { type: 'MOVE_TO', target_id: 'c1' },
    fallback: { if_failed: 'STOP' },
    explanation: 'Moving toward the goal.',
  };

  it('accepts a valid MOVE_TO decision', () => {
    const result = validateNavigationDecision(validDecision);
    expect(result.valid).toBe(true);
  });

  it('accepts MOVE_TO with target_m', () => {
    const result = validateNavigationDecision({
      ...validDecision,
      action: { type: 'MOVE_TO', target_m: [1.5, 2.0] },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts EXPLORE action', () => {
    const result = validateNavigationDecision({
      action: { type: 'EXPLORE', target_id: 'f1' },
      fallback: { if_failed: 'ROTATE_TO' },
      explanation: 'Exploring frontier.',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts ROTATE_TO with yaw_deg', () => {
    const result = validateNavigationDecision({
      action: { type: 'ROTATE_TO', yaw_deg: 90 },
      fallback: { if_failed: 'STOP' },
      explanation: 'Rotating to scan.',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts STOP action', () => {
    const result = validateNavigationDecision({
      action: { type: 'STOP' },
      fallback: { if_failed: 'STOP' },
      explanation: 'Stopping.',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts FOLLOW_WALL action', () => {
    const result = validateNavigationDecision({
      action: { type: 'FOLLOW_WALL' },
      fallback: { if_failed: 'STOP' },
      explanation: 'Following wall.',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts decision with world_model_update', () => {
    const result = validateNavigationDecision({
      ...validDecision,
      world_model_update: {
        corrections: [
          { pos_m: [1.0, 2.0], observed_state: 'free', confidence: 0.8 },
        ],
      },
    });
    expect(result.valid).toBe(true);
  });

  // --- Rejection cases ---

  it('rejects null input', () => {
    const result = validateNavigationDecision(null);
    expect(result.valid).toBe(false);
  });

  it('rejects missing action', () => {
    const result = validateNavigationDecision({
      fallback: { if_failed: 'STOP' },
      explanation: 'test',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid action type', () => {
    const result = validateNavigationDecision({
      action: { type: 'FLY_AWAY' },
      fallback: { if_failed: 'STOP' },
      explanation: 'test',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('FLY_AWAY');
  });

  it('rejects MOVE_TO without target', () => {
    const result = validateNavigationDecision({
      action: { type: 'MOVE_TO' },
      fallback: { if_failed: 'STOP' },
      explanation: 'test',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects ROTATE_TO without yaw_deg', () => {
    const result = validateNavigationDecision({
      action: { type: 'ROTATE_TO' },
      fallback: { if_failed: 'STOP' },
      explanation: 'test',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing fallback', () => {
    const result = validateNavigationDecision({
      action: { type: 'STOP' },
      explanation: 'test',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects empty explanation', () => {
    const result = validateNavigationDecision({
      action: { type: 'STOP' },
      fallback: { if_failed: 'STOP' },
      explanation: '',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid world_model_update correction', () => {
    const result = validateNavigationDecision({
      ...validDecision,
      world_model_update: {
        corrections: [
          { pos_m: [1.0], observed_state: 'free', confidence: 0.8 },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid observed_state', () => {
    const result = validateNavigationDecision({
      ...validDecision,
      world_model_update: {
        corrections: [
          { pos_m: [1.0, 2.0], observed_state: 'lava', confidence: 0.8 },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const result = validateNavigationDecision({
      ...validDecision,
      world_model_update: {
        corrections: [
          { pos_m: [1.0, 2.0], observed_state: 'free', confidence: 1.5 },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Parsing
// =============================================================================

describe('parseNavigationDecision', () => {
  it('parses valid JSON', () => {
    const json = JSON.stringify({
      action: { type: 'MOVE_TO', target_id: 'c1' },
      fallback: { if_failed: 'EXPLORE' },
      explanation: 'Moving forward.',
    });

    const result = parseNavigationDecision(json);
    expect(result.valid).toBe(true);
  });

  it('strips markdown code fences', () => {
    const wrapped = '```json\n{"action":{"type":"STOP"},"fallback":{"if_failed":"STOP"},"explanation":"stop"}\n```';

    const result = parseNavigationDecision(wrapped);
    expect(result.valid).toBe(true);
  });

  it('strips bare code fences', () => {
    const wrapped = '```\n{"action":{"type":"STOP"},"fallback":{"if_failed":"STOP"},"explanation":"stop"}\n```';

    const result = parseNavigationDecision(wrapped);
    expect(result.valid).toBe(true);
  });

  it('handles trailing commas', () => {
    const withTrailingComma = '{"action":{"type":"STOP",},"fallback":{"if_failed":"STOP",},"explanation":"stop",}';

    const result = parseNavigationDecision(withTrailingComma);
    expect(result.valid).toBe(true);
  });

  it('returns error for invalid JSON', () => {
    const result = parseNavigationDecision('not json at all');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('JSON parse error');
  });

  it('returns error for valid JSON but invalid schema', () => {
    const result = parseNavigationDecision('{"foo": "bar"}');
    expect(result.valid).toBe(false);
  });
});
