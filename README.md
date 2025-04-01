# AST-Based Code Similarity Analysis

A tool for analyzing code similarity using Abstract Syntax Trees (ASTs) and visualizing relationships between files in a codebase.

## Overview

This project analyzes TypeScript/JavaScript code files by:
1. Parsing files into Abstract Syntax Trees (ASTs)
2. Extracting various code features
3. Computing similarity between files
4. Visualizing relationships in an interactive graph

Currently analyzing: **Cluster 33** from Twenty CRM's [codebase](https://github.com/twentyhq/twenty)

## Installation

```bash
npm install tree-sitter tree-sitter-typescript --legacy-peer-deps
```

![image](https://github.com/user-attachments/assets/09b9a02e-74fc-4f59-bf2d-fd06004c722b)



### Feature Extraction

We use Tree-sitter to parse TypeScript files and extract the following features:

1. **Declarations**
   - Functions (`@function_name`)
   - Classes (`@class_name`)
   - Methods (`@method_name`)
   - Interfaces (`@interface_name`)
   - Type Aliases (`@type_alias_name`)
   - Enums (`@enum_name`)
   - Class Properties (`@class_prop_name`)
   - Implemented Interfaces (`@implemented_interface_name`)

2. **Variables & Assignments**
   - Variable Declarations (`@variable_name`)
   - Assignment Targets (`@assign_target`)

3. **Function/Method Calls**
   - Direct Function Calls (`@call_func_name`)
   - Method Calls (`@call_method_name`)
   - Call Objects (`@call_object`)

4. **Imports/Exports**
   - Import Sources (`@import_source`)
   - Export Statements

5. **Control Flow**
   - If Statements
   - For Loops
   - While Loops

6. **Types & Literals**
   - Type Annotations
   - String Literals
   - Number Literals
   - Boolean Literals
   - Null Literals

7. **Comments**
   - All comment types

### Similarity Calculation

We use two similarity measures:

1. **Jaccard Similarity**
   - Used for comparing sets of features (imports, declarations, calls, etc.)
   - Formula: |A ∩ B| / |A ∪ B|
   - Range: 0 (no similarity) to 1 (identical)

2. **Cosine Similarity**
   - Used for comparing node count vectors
   - Measures angle between feature vectors
   - Range: 0 (orthogonal) to 1 (parallel)

The overall similarity is a weighted combination:
```javascript
weights = {
    imports: 0.3,
    declarations: 0.3,
    calls: 0.15,
    strings: 0.05,
    counts: 0.2
}
```

## Visualization

The visualization is built using Cytoscape.js and provides:

### Features
- Interactive graph visualization
- Node-link diagram representing files and similarities
- Adjustable similarity threshold via slider (0.0 to 1.0)
- Direct links to GitHub source files
- Detailed feature comparison panel

### Visual Elements
- **Nodes**: Files (green)
- **Edges**: Similarities (blue)
- **Edge Thickness**: Proportional to similarity score
- **Selected Elements**: Highlighted in yellow-orange

### Interactive Features
1. **Threshold Slider**
   - Dynamically filter connections based on similarity score
   - Range: 0 to 1 with 0.05 steps
   - Default: 0.2

2. **Edge Clicks**
   - Shows detailed feature comparison panel
   - Lists common elements between files:
     - Import Sources
     - Functions
     - Classes
     - Methods
     - Interfaces
     - Implemented Interfaces
     - Function Calls
     - Method Calls
     - Variables
     - String Literals


