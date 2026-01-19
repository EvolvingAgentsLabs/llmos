---
name: Data Analysis Workflow
category: analysis
description: Step-by-step approach for analyzing datasets
keywords: [data, analysis, pandas, statistics, visualization]
---

# Skill: Data Analysis Workflow

## When to Use
Use this skill when analyzing data, exploring datasets, or generating insights from data.

## Approach

### 1. Load and Inspect Data
- Load data using appropriate library (pandas, numpy)
- Check data types and shape
- Look for missing values
- Display sample rows

### 2. Data Cleaning
- Handle missing values (drop, fill, interpolate)
- Remove duplicates
- Fix data type issues
- Handle outliers

### 3. Exploratory Analysis
- Calculate summary statistics (mean, median, std)
- Check distributions
- Identify correlations
- Look for patterns and anomalies

### 4. Visualization
- Create plots to understand data
- Use appropriate chart types (bar, line, scatter, histogram)
- Add labels and titles
- Consider color-blind friendly palettes

### 5. Draw Conclusions
- Answer the original question
- Identify key findings
- Note limitations
- Suggest next steps

## Example

```python
import pandas as pd
import matplotlib.pyplot as plt

# 1. Load data
df = pd.read_csv('data.csv')

# 2. Inspect
print(df.info())
print(df.describe())
print(df.head())

# 3. Check for missing values
print(df.isnull().sum())

# 4. Clean
df = df.dropna()
df = df.drop_duplicates()

# 5. Analyze
correlation = df.corr()
print(correlation)

# 6. Visualize
df['column'].hist(bins=20)
plt.title('Distribution of Column')
plt.xlabel('Value')
plt.ylabel('Frequency')
plt.show()
```

## Common Libraries
- **pandas**: Data manipulation and analysis
- **numpy**: Numerical operations
- **matplotlib/seaborn**: Visualization
- **scipy**: Statistical analysis
- **sklearn**: Machine learning
