How to Use This for Similarity:

Run this script for each TypeScript file you want to analyze.

Each run will produce a file-features.json (you'll need to modify the script to save with unique names, e.g., based on the input filePath, or collect results in memory if running for multiple files).

Load these feature objects.

Compare the featureSets (e.g., using Jaccard Index on the arrays of function names, import sources, etc.) and potentially the nodeCounts (e.g., using Cosine Similarity on vectors derived from counts) between pairs of files to calculate similarity scores.

Use these scores as edge weights in your graph.