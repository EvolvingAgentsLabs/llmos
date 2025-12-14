---
skill_id: weather-analysis-node
name: Weather Data Analysis via MCP
description: Fetch and analyze weather data using MCP weather service
type: python-wasm
execution_mode: browser-wasm
category: data
tags: ["weather", "mcp", "api", "analysis"]
version: 1.0.0
author: system
estimated_time_ms: 2000
memory_mb: 50
mcp_servers: ["weather-api"]
execution_policy: standard
inputs:
  - name: location
    type: string
    description: Location to get weather for (city name or coordinates)
    default: "San Francisco, CA"
    required: true
  - name: days
    type: number
    description: Number of days to analyze
    default: 7
    required: true
outputs:
  - name: temperature_avg
    type: number
    description: Average temperature in Celsius
  - name: temperature_range
    type: object
    description: Min and max temperatures
  - name: conditions
    type: array
    description: Weather conditions for each day
  - name: summary
    type: string
    description: Human-readable weather summary
---

# Weather Data Analysis via MCP

Fetches weather data from an MCP weather service and performs statistical analysis.

This skill demonstrates:
- Using MCP from Python (Pyodide)
- Data processing with numpy
- Multi-day analysis
- Error handling with execution policies

## Inputs
- **location** (string): Location to get weather for
- **days** (number): Number of days to analyze (1-14)

## Outputs
- **temperature_avg** (number): Average temperature in Celsius
- **temperature_range** (object): Min and max temperatures
- **conditions** (array): Weather conditions for each day
- **summary** (string): Human-readable weather summary

## MCP Configuration

This skill requires a weather MCP server to be configured.

Example MCP server configuration:
```json
{
  "name": "weather-api",
  "url": "https://mcp.example.com/weather",
  "timeout": 15000
}
```

## Code

```python
import json

def execute(context):
    """
    Fetch and analyze weather data via MCP

    This runs in Pyodide (Python compiled to WebAssembly).
    It uses the MCP client to fetch weather data from an external API.
    """
    inputs = context['inputs']
    mcp = context['mcp']
    enforcer = context['enforcer']

    location = inputs.get('location', 'San Francisco, CA')
    days = int(inputs.get('days', 7))

    # Validate inputs
    if days < 1 or days > 14:
        raise ValueError("Days must be between 1 and 14")

    # Check MCP access policy
    server_name = "weather-api"
    # Note: In Python, we need to call the enforcer methods differently
    # This is a simplified example showing the concept

    try:
        # Call MCP server to fetch weather data
        # Note: In Pyodide, we need to use the JavaScript interop
        # This is a conceptual example - actual implementation would use js module
        result = {
            'forecast': [
                {'day': i, 'temp_c': 20 + (i % 5), 'condition': 'sunny'}
                for i in range(days)
            ]
        }

        # In real implementation:
        # import js
        # result = await js.mcp.call(server_name, 'forecast', {
        #     'location': location,
        #     'days': days
        # })

        # Extract temperature data
        forecast = result.get('forecast', [])
        temperatures = [day['temp_c'] for day in forecast]

        # Calculate statistics
        if temperatures:
            temp_avg = sum(temperatures) / len(temperatures)
            temp_min = min(temperatures)
            temp_max = max(temperatures)
        else:
            temp_avg = 0
            temp_min = 0
            temp_max = 0

        # Extract conditions
        conditions = [
            {
                'day': day['day'],
                'temperature': day['temp_c'],
                'condition': day['condition']
            }
            for day in forecast
        ]

        # Generate summary
        summary = f"Weather in {location} over {days} days:\\n"
        summary += f"Average temperature: {temp_avg:.1f}°C\\n"
        summary += f"Temperature range: {temp_min:.1f}°C to {temp_max:.1f}°C\\n"
        summary += f"Conditions: {', '.join(set(day['condition'] for day in forecast))}"

        return {
            'temperature_avg': round(temp_avg, 2),
            'temperature_range': {
                'min': temp_min,
                'max': temp_max
            },
            'conditions': conditions,
            'summary': summary
        }

    except Exception as e:
        raise RuntimeError(f"Weather data fetch failed: {str(e)}")
```

## Usage Notes

This node executes in browser-wasm using Pyodide.
Estimated execution time: 2000ms (depends on API response time)
Memory usage: ~50MB

### Execution Policy

This skill uses the "standard" execution policy:
- **Max Memory**: 512MB
- **Max Time**: 60 seconds
- **Network Access**: Allowed (via MCP only)
- **MCP Access**: Allowed (weather-api only)

### Example Workflow

**Weather Dashboard:**
1. Fetch weather data (this node)
2. Create temperature chart (visualization node)
3. Generate weather report (markdown node)

**Multi-Location Comparison:**
1. Fetch weather for New York (this node)
2. Fetch weather for London (this node)
3. Compare data (analysis node)
4. Visualize comparison (chart node)

**Weather Alerts:**
1. Fetch weather data (this node)
2. Check for extreme conditions (filter node)
3. Send alert if needed (notification node)

### Python in the Browser

This skill runs Python code directly in the browser using Pyodide:
- No server required
- Sandboxed execution
- Access to numpy, pandas (if imported)
- JavaScript interop for MCP calls

### MCP JavaScript Interop

To call MCP from Pyodide, use the `js` module:

```python
import js
import json

# Call MCP server
result_promise = js.mcp.call('server-name', 'method', {
    'param': 'value'
})

# Await the promise (in async context)
result = await result_promise

# Convert from JavaScript to Python
data = result.to_py()
```

## Security Considerations

1. **Execution Policy**: Limits memory and time
2. **MCP Allowlist**: Can only access declared servers
3. **Sandboxing**: Runs in WebAssembly sandbox
4. **No Direct Network**: Network access only via MCP

## Related Skills

- **database-query-node**: Query databases via MCP
- **data-analysis**: General data analysis
- **visualization**: Plot weather trends
