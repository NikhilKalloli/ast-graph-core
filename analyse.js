const fs = require('fs').promises;
const path = require('path'); // Use path module for robust path handling
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// --- Query String (UNCHANGED as requested) ---
const comprehensiveQueryString = `
; --- Declarations ---

(function_declaration
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  body: (statement_block) @function_body) @function_definition

(class_declaration
  name: (type_identifier) @class_name
  body: (class_body) @class_body) @class_definition

(method_definition
  name: (property_identifier) @method_name
  parameters: (formal_parameters) @method_params
  body: (statement_block) @method_body) @method_definition

(public_field_definition
  name: (property_identifier) @class_prop_name) @class_property

(interface_declaration
  name: (type_identifier) @interface_name) @interface_definition

(type_alias_declaration
  name: (type_identifier) @type_alias_name) @type_alias_definition

(enum_declaration
  name: (identifier) @enum_name) @enum_definition

; --- Variables & Assignments ---

(lexical_declaration
  (variable_declarator
    name: (_) @variable_name)) @variable_declaration

(variable_declaration
  (variable_declarator
    name: (_) @variable_name)) @variable_declaration_legacy

(assignment_expression
  left: (_) @assign_target
  right: (_) @assign_value) @assignment

; --- Function/Method Calls ---

(call_expression
  function: (identifier) @call_func_name) @call_expression_direct

(call_expression
  function: (member_expression
    object: (_) @call_object
    property: (property_identifier) @call_method_name)) @call_expression_member

; --- Imports ---

(import_statement
  source: (string) @import_source) @import_statement

; --- Exports ---

(export_statement) @export_statement

; --- Control Flow ---

(if_statement
  condition: (_) @if_condition) @if_statement

(for_statement) @for_loop
(while_statement) @while_loop

; --- Types ---

(type_annotation) @type_annotation

; --- Literals and Expressions ---

(string) @string_literal
(number) @number_literal
(true) @boolean_literal_true
(false) @boolean_literal_false
(null) @null_literal

; --- Comments ---
(comment) @comment
`;


// --- Modified parseFile to return features ---
// Takes filePath as argument, returns features object or null on error
async function parseFileAndExtractFeatures(filePath) {
  console.log(`\nProcessing file: ${filePath}`);
  try {
    // Simply use the relative path from where analyse.js is located
    const absoluteFilePath = path.resolve(__dirname, 'twenty/packages/twenty-server', filePath.replace('/twenty/packages/twenty-server/', ''));
    
    const source = await fs.readFile(absoluteFilePath, 'utf8');
    const tree = parser.parse(source);

    const query = new Parser.Query(TypeScript, comprehensiveQueryString);
    const captures = query.captures(tree.rootNode);
    console.log(`  Query captured ${captures.length} nodes.`);

    // --- AGGREGATED FEATURE EXTRACTION ---
    const fileFeatures = {
      filePath: filePath, // Store the original relative path from clusters.json
      featureSets: {
        functionNames: new Set(), classNames: new Set(), methodNames: new Set(),
        classPropNames: new Set(), interfaceNames: new Set(), typeAliasNames: new Set(),
        enumNames: new Set(), variableNames: new Set(), assignTargets: new Set(),
        callFuncNames: new Set(), callMethodNames: new Set(), callObjectTargets: new Set(),
        importSources: new Set(), stringLiterals: new Set(),
      },
      nodeCounts: {},
      // detailedCaptures: [] // Optionally keep detailed list if needed elsewhere
    };

    for (const { name: captureType, node } of captures) {
      const fullText = node.text;
      const nodeType = node.type;

      fileFeatures.nodeCounts[nodeType] = (fileFeatures.nodeCounts[nodeType] || 0) + 1;
      fileFeatures.nodeCounts[`capture_${captureType}`] = (fileFeatures.nodeCounts[`capture_${captureType}`] || 0) + 1;

      let enclosingFunction = null;
      let enclosingClass = null;
      let parent = node.parent;
      while (parent) {
        if (!enclosingFunction && (parent.type === 'function_declaration' || parent.type === 'method_definition')) {
          const nameNode = parent.childForFieldName('name');
          enclosingFunction = nameNode?.text || (parent.type === 'function_declaration' ? '[anonymous_func]' : '[anonymous_method]');
        } else if (!enclosingFunction && parent.type === 'arrow_function') {
            let assignmentParent = parent.parent;
             if (assignmentParent?.type === 'variable_declarator') {
                 const nameNode = assignmentParent.childForFieldName('name');
                 enclosingFunction = nameNode?.text ? `${nameNode.text} (arrow)` : '[anonymous_arrow]';
             } else { enclosingFunction = '[anonymous_arrow]'; }
        } else if (!enclosingClass && parent.type === 'class_declaration') {
          const nameNode = parent.childForFieldName('name');
          enclosingClass = nameNode?.text || '[anonymous_class]';
        }
        if ((enclosingFunction && enclosingClass) || !parent.parent) break;
        parent = parent.parent;
      }

      // Populate Feature Sets
       switch (captureType) {
         case 'function_name': fileFeatures.featureSets.functionNames.add(fullText); break;
         case 'class_name': fileFeatures.featureSets.classNames.add(fullText); break;
         case 'method_name':
           const qMN = enclosingClass ? `${enclosingClass}::${fullText}` : fullText;
           fileFeatures.featureSets.methodNames.add(qMN); break;
         case 'class_prop_name': fileFeatures.featureSets.classPropNames.add(fullText); break;
         case 'interface_name': fileFeatures.featureSets.interfaceNames.add(fullText); break;
         case 'type_alias_name': fileFeatures.featureSets.typeAliasNames.add(fullText); break;
         case 'enum_name': fileFeatures.featureSets.enumNames.add(fullText); break;
         case 'variable_name': fileFeatures.featureSets.variableNames.add(node.text); break;
         case 'assign_target': fileFeatures.featureSets.assignTargets.add(node.text); break;
         case 'call_func_name': fileFeatures.featureSets.callFuncNames.add(fullText); break;
         case 'call_object': fileFeatures.featureSets.callObjectTargets.add(node.text); break;
         case 'call_method_name': fileFeatures.featureSets.callMethodNames.add(fullText); break;
         case 'import_source':
           try { fileFeatures.featureSets.importSources.add(JSON.parse(fullText)); }
           catch(e) { fileFeatures.featureSets.importSources.add(fullText); } break;
         case 'string_literal':
           try { if(fullText.length < 100) fileFeatures.featureSets.stringLiterals.add(JSON.parse(fullText)); } // Limit string literal length
           catch(e) { if(fullText.length < 100) fileFeatures.featureSets.stringLiterals.add(fullText); } break;
       }
    }

    // Convert Sets to Arrays for easier processing later (optional here)
    // for (const key in fileFeatures.featureSets) {
    //     if (fileFeatures.featureSets[key] instanceof Set) {
    //         fileFeatures.featureSets[key] = Array.from(fileFeatures.featureSets[key]);
    //     }
    // }

    console.log(`  Finished processing: ${filePath}`);
    return fileFeatures;

  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error.message);
    // Log query errors specifically if they occur during compilation (less likely now)
    const errorOffset = error?.errorOffset;
    const errorType = error?.errorType;
    if (typeof errorOffset === 'number' && typeof errorType === 'string') {
      console.error("  Query Compilation Error Details:", errorType, "at", errorOffset);
    }
    return null; // Indicate failure
  }
}

// --- Similarity Calculation Functions ---

function jaccardSimilarity(setA, setB) {
  if (!(setA instanceof Set) || !(setB instanceof Set)) {
    console.warn("Attempted Jaccard on non-Set inputs");
    return 0;
  }
  const intersectionSize = new Set([...setA].filter(x => setB.has(x))).size;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 1 : intersectionSize / unionSize; // Handle empty sets case
}

// Helper for Cosine Similarity
function createVector(dictA, dictB, allKeys) {
    const vectorA = [];
    const vectorB = [];
    for (const key of allKeys) {
        vectorA.push(dictA[key] || 0);
        vectorB.push(dictB[key] || 0);
    }
    return { vectorA, vectorB };
}

function cosineSimilarity(dictA, dictB) {
    const allKeys = new Set([...Object.keys(dictA), ...Object.keys(dictB)]);
    if (allKeys.size === 0) return 1; // Both empty

    const { vectorA, vectorB } = createVector(dictA, dictB, allKeys);

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
        magnitudeA += vectorA[i] * vectorA[i];
        magnitudeB += vectorB[i] * vectorB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0; // Avoid division by zero if one vector is all zeros
    }

    return dotProduct / (magnitudeA * magnitudeB);
}


function calculateOverallSimilarity(featuresA, featuresB) {
    if (!featuresA || !featuresB) return 0;

    // Define weights for different feature types (adjust as needed)
    const weights = {
        imports: 0.3,
        declarations: 0.3, // Combined score for func/class/method/etc. names
        calls: 0.15, // Combined score for function/method calls
        strings: 0.05, // Lower weight for string literals
        counts: 0.2 // Cosine similarity on node counts
    };

    // Calculate Jaccard for sets
    const simImports = jaccardSimilarity(featuresA.featureSets.importSources, featuresB.featureSets.importSources);

    // Combine declaration names into single sets for comparison
    const declarationsA = new Set([
        ...featuresA.featureSets.functionNames, ...featuresA.featureSets.classNames,
        ...featuresA.featureSets.methodNames, ...featuresA.featureSets.interfaceNames,
        ...featuresA.featureSets.typeAliasNames, ...featuresA.featureSets.enumNames,
        ...featuresA.featureSets.variableNames // Maybe weigh variables less?
    ]);
    const declarationsB = new Set([
         ...featuresB.featureSets.functionNames, ...featuresB.featureSets.classNames,
         ...featuresB.featureSets.methodNames, ...featuresB.featureSets.interfaceNames,
         ...featuresB.featureSets.typeAliasNames, ...featuresB.featureSets.enumNames,
         ...featuresB.featureSets.variableNames
    ]);
    const simDeclarations = jaccardSimilarity(declarationsA, declarationsB);

    // Combine call names
    const callsA = new Set([...featuresA.featureSets.callFuncNames, ...featuresA.featureSets.callMethodNames]);
    const callsB = new Set([...featuresB.featureSets.callFuncNames, ...featuresB.featureSets.callMethodNames]);
    const simCalls = jaccardSimilarity(callsA, callsB);

    const simStrings = jaccardSimilarity(featuresA.featureSets.stringLiterals, featuresB.featureSets.stringLiterals);

    // Calculate Cosine for node counts
    const simCounts = cosineSimilarity(featuresA.nodeCounts, featuresB.nodeCounts);

    // Calculate weighted average
    let totalScore = 0;
    totalScore += simImports * weights.imports;
    totalScore += simDeclarations * weights.declarations;
    totalScore += simCalls * weights.calls;
    totalScore += simStrings * weights.strings;
    totalScore += simCounts * weights.counts;

    // Optional: Normalize if weights don't sum to 1 (they should ideally)
    // const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    // return totalWeight > 0 ? totalScore / totalWeight : 0;

    return totalScore;
}


// --- Main Orchestration Logic ---
async function processCluster(clusterDataFile, targetClusterId) {
  console.log(`Loading cluster data from ${clusterDataFile}...`);
  let clusters;
  try {
    const clusterDataContent = await fs.readFile(clusterDataFile, 'utf8');
    clusters = JSON.parse(clusterDataContent);
  } catch (err) {
    console.error(`Failed to read or parse cluster file: ${err.message}`);
    return;
  }

  const targetCluster = clusters.find(c => c.cluster_id === targetClusterId);

  if (!targetCluster) {
    console.error(`Cluster with ID ${targetClusterId} not found.`);
    return;
  }

  console.log(`Found cluster ${targetClusterId} with ${targetCluster.filepaths.length} files.`);

  const allFeatures = {}; // Store features keyed by filePath
  const fileList = targetCluster.filepaths;

  // 1. Parse all files and extract features
  for (const filePath of fileList) {
    const features = await parseFileAndExtractFeatures(filePath);
    if (features) {
      // Convert sets to arrays before storing, if desired for output consistency
       for (const key in features.featureSets) {
           if (features.featureSets[key] instanceof Set) {
              features.featureSets[key] = Array.from(features.featureSets[key]);
           }
       }
      allFeatures[filePath] = features;
    } else {
        console.warn(`Skipping ${filePath} due to parsing errors.`);
    }
  }

  console.log(`\nSuccessfully extracted features for ${Object.keys(allFeatures).length} files.`);
  if (Object.keys(allFeatures).length < 2) {
      console.log("Need at least two successfully parsed files to calculate similarities.");
      return;
  }


  // 2. Calculate pairwise similarities
  console.log("Calculating similarities...");
  const similarityResults = [];
  const processedPairs = new Set(); // Avoid calculating A->B and B->A

  for (let i = 0; i < fileList.length; i++) {
      const fileA = fileList[i];
      if (!allFeatures[fileA]) continue; // Skip if parsing failed

      for (let j = i + 1; j < fileList.length; j++) {
          const fileB = fileList[j];
          if (!allFeatures[fileB]) continue; // Skip if parsing failed

          // Re-convert arrays back to sets for Jaccard calculation
          const featuresA_sets = {};
          const featuresB_sets = {};
          for(const key in allFeatures[fileA].featureSets){
              featuresA_sets[key] = new Set(allFeatures[fileA].featureSets[key]);
              featuresB_sets[key] = new Set(allFeatures[fileB].featureSets[key]);
          }

          // Pass objects with Sets and counts to the similarity function
          const similarityScore = calculateOverallSimilarity(
               { ...allFeatures[fileA], featureSets: featuresA_sets },
               { ...allFeatures[fileB], featureSets: featuresB_sets }
          );

          similarityResults.push({
              fileA: fileA,
              fileB: fileB,
              similarity: parseFloat(similarityScore.toFixed(4)) // Format score
          });
      }
  }
   console.log(`Calculated ${similarityResults.length} similarity pairs.`);

  // 3. Save similarity results
  const outputFilename = `cluster_${targetClusterId}_similarity_edges.json`;
  try {
    await fs.writeFile(outputFilename, JSON.stringify(similarityResults, null, 2));
    console.log(`Similarity results saved to ${outputFilename}`);
  } catch (err) {
    console.error(`Failed to save similarity results: ${err.message}`);
  }
}

// --- Run the process ---
const CLUSTER_FILE = './clusters.json'; // Adjust path if needed
const TARGET_CLUSTER = '33';

processCluster(CLUSTER_FILE, TARGET_CLUSTER).catch(error => {
  console.error('Unhandled error during cluster processing:', error);
  process.exit(1);
});