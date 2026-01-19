---
name: Python Coding Best Practices
category: coding
description: Best practices for writing clean, maintainable Python code
keywords: [python, coding, clean code, best practices]
---

# Skill: Python Coding Best Practices

## When to Use
Use this skill when writing Python code, creating scripts, or building applications.

## Approach

### 1. Code Organization
- Start with imports (standard library, third-party, local)
- Define constants at module level
- Group related functions into classes
- Keep functions small and focused (single responsibility)

### 2. Naming Conventions
- Use `snake_case` for functions and variables
- Use `PascalCase` for class names
- Use `UPPER_CASE` for constants
- Choose descriptive names over short names

### 3. Documentation
- Add docstrings to all functions and classes
- Use type hints for function parameters and returns
- Include examples in docstrings for complex functions

### 4. Error Handling
- Use specific exception types
- Provide helpful error messages
- Clean up resources with `try/finally` or context managers

### 5. Testing
- Write unit tests for core functionality
- Use descriptive test names
- Test edge cases and error conditions

## Example

```python
from typing import List, Optional

def calculate_average(numbers: List[float]) -> Optional[float]:
    """
    Calculate the average of a list of numbers.

    Args:
        numbers: List of numbers to average

    Returns:
        Average value, or None if list is empty

    Example:
        >>> calculate_average([1, 2, 3, 4, 5])
        3.0
    """
    if not numbers:
        return None

    return sum(numbers) / len(numbers)
```

## Additional Tips
- Use list comprehensions for simple transformations
- Leverage built-in functions (`map`, `filter`, `zip`)
- Profile before optimizing
- Follow PEP 8 style guide
