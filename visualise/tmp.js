function processImportsData(csvText) {
    const lines = csvText.trim().split('\n');
    
    // Step 1: Create both file-to-imports and import-to-files mappings
    const fileImports = new Map();  // file -> Set of imports
    const importFiles = new Map();  // import -> Set of files
    
    lines.slice(1).forEach(line => {
        const [file, featureType, importPath] = line.split(',').map(s => s.trim());
        if (featureType === 'importSources') {
            const cleanImport = importPath.replace(/[']/g, '').trim();
            
            // Map: file -> imports
            if (!fileImports.has(file)) {
                fileImports.set(file, new Set());
            }
            fileImports.get(file).add(cleanImport);
            
            // Map: import -> files
            if (!importFiles.has(cleanImport)) {
                importFiles.set(cleanImport, new Set());
            }
            importFiles.get(cleanImport).add(file);
        }
    });

    // Step 2: Find related files using both mappings
    const edges = [];
    const files = Array.from(fileImports.keys());
    
    for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
            const fileA = files[i];
            const fileB = files[j];
            
            // Method 1: Direct comparison of import sets
            const importsA = fileImports.get(fileA);
            const importsB = fileImports.get(fileB);
            const commonImports = new Set([...importsA].filter(x => importsB.has(x)));
            
            // Method 2: Find files that share the same imports
            const sharedImportPaths = new Set();
            importsA.forEach(importPath => {
                if (importsB.has(importPath)) {
                    sharedImportPaths.add(importPath);
                }
            });
            
            // Only create an edge if there are common imports
            if (sharedImportPaths.size > 0) {
                // Calculate similarity metrics
                const similarity = {
                    commonImportsCount: sharedImportPaths.size,
                    // Jaccard similarity: intersection size / union size
                    jaccardSimilarity: sharedImportPaths.size / 
                        new Set([...importsA, ...importsB]).size,
                    // Percentage of shared imports relative to smaller file
                    overlapCoefficient: sharedImportPaths.size / 
                        Math.min(importsA.size, importsB.size)
                };
                
                edges.push({
                    fileA,
                    fileB,
                    weight: similarity.commonImportsCount,
                    jaccardSimilarity: similarity.jaccardSimilarity,
                    overlapCoefficient: similarity.overlapCoefficient,
                    commonImports: Array.from(sharedImportPaths)
                });
            }
        }
    }

    // Step 3: Sort edges by multiple criteria for highest accuracy
    edges.sort((a, b) => {
        // First compare by number of common imports
        if (b.weight !== a.weight) {
            return b.weight - a.weight;
        }
        // Then by Jaccard similarity
        if (b.jaccardSimilarity !== a.jaccardSimilarity) {
            return b.jaccardSimilarity - a.jaccardSimilarity;
        }
        // Finally by overlap coefficient
        return b.overlapCoefficient - a.overlapCoefficient;
    });

    return {
        nodes: files,
        edges: edges,
        fileImports: fileImports,
        importFiles: importFiles
    };
}