# Evolution Rules

These rules define how LLMos learns from experience and generates new skills.

---

## Evolution Philosophy

> "Every successful execution is a learning opportunity."

The evolution system:
1. Observes execution traces
2. Detects repeated patterns
3. Generates reusable skills
4. Promotes skills across volumes

---

## Pattern Detection

### Goal Normalization
Before comparing goals, normalize them:
1. Convert to lowercase
2. Remove punctuation
3. Collapse multiple whitespace to single space
4. Trim leading/trailing whitespace

### Signature Computation
Pattern signatures are computed as:
```
signature = SHA256(normalized_goal)[:16]
```

This creates a 16-character hex string for pattern matching.

### Pattern Grouping
Traces are grouped by signature:
- Same signature = same goal pattern
- Minimum 2 occurrences to form a pattern
- Patterns sorted by count (most frequent first)

---

## Success Rate Calculation

### Success Indicators
Look for these markers in trace content:
- `success_rating: 0.9` or higher
- `Success Rating: 90%` or higher
- `status: success`
- `completed successfully`

### Calculation
```
success_rate = successful_traces / total_traces
```

---

## Skill Generation Thresholds

### Minimum Requirements
| Parameter | Value | Description |
|-----------|-------|-------------|
| `min_pattern_count` | 3 | Minimum occurrences to create skill |
| `min_success_rate` | 0.7 | Minimum 70% success rate |
| `min_confidence` | 0.5 | Minimum confidence to save skill |

### Category Detection
Infer category from goal keywords:

| Keywords | Category |
|----------|----------|
| code, script, program, python, function | `coding` |
| analyze, data, statistics, metrics | `analysis` |
| write, document, report, explain | `writing` |
| data, csv, json, database | `data` |
| (default) | `general` |

---

## Skill Format

Generated skills follow this format:

```markdown
---
name: [descriptive name]
category: [coding|analysis|writing|data|general]
description: [one-line description]
keywords: [list of keywords]
source_traces: [number of source traces]
confidence: [0.0-1.0]
created_at: [ISO 8601 timestamp]
---

# Skill: [Name]

## When to Use
[Conditions for using this skill]

## Approach
1. [Step 1]
2. [Step 2]
...

## Example
[Code or usage example if applicable]

## Notes
[Auto-generation metadata]
```

---

## Volume Hierarchy

Skills progress through volumes:

```
User Volume (private, experimental)
    ↓ (promote after 5+ uses, 80%+ success)
Team Volume (shared, collaborative)
    ↓ (promote after 10+ team uses, 90%+ success)
System Volume (global, stable)
```

### Promotion Criteria

**User → Team:**
- Minimum 5 successful uses
- Success rate ≥ 80%
- User initiates promotion

**Team → System:**
- Minimum 10 successful uses across team
- Success rate ≥ 90%
- Admin approval required

---

## Evolution Cron Schedule

### User Evolution
- **Frequency**: On-demand or daily
- **Scope**: User's traces only
- **Output**: Skills in user volume

### Team Evolution
- **Frequency**: Weekly
- **Scope**: All team members' traces
- **Output**: Consolidated team skills

### System Evolution
- **Frequency**: Monthly
- **Scope**: Cross-team patterns
- **Output**: Promoted system skills

---

## LLM-Enhanced Generation

When LLM is available, skill generation is enhanced:

### Prompt Template
```
You are creating a reusable "Skill" from a repeated pattern.

Pattern detected:
- Goal: {pattern.description}
- Seen {pattern.count} times
- Success rate: {pattern.success_rate}%

Example trace:
{pattern.example_content}

Create a Skill with:
- **Skill Name**: [Short, descriptive]
- **Category**: [coding|analysis|writing|data]
- **Description**: [When to use this skill]
- **Keywords**: [For search]
- **Approach**: [Step-by-step guide]
- **Example**: [Code or usage if applicable]
```

### Fallback (No LLM)
If LLM is unavailable, use template-based generation:
1. Extract goal as skill name
2. Infer category from keywords
3. Generate generic "approach" section
4. Note that skill is auto-generated

---

## Anti-Patterns

### Do NOT Create Skills For:
- Single-use tasks (no repetition)
- Failed executions (success rate < 50%)
- Trivial patterns (e.g., "hello world")
- Sensitive operations (credentials, PII)

### Skill Hygiene
- Remove duplicate skills monthly
- Archive skills unused for 6 months
- Merge similar skills when detected
