const fs = require('fs').promises;
const path = require('path');
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// Use the same comprehensive query string
const comprehensiveQueryString = `
; --- Declarations ---
(function_declaration name: (identifier) @function_name parameters: (formal_parameters) @function_params body: (statement_block) @function_body) @function_definition

(class_declaration
  name: (type_identifier) @class_name
  ; CORRECTED: Look for implements_clause as a potential child node pattern, often within class_heritage
  (class_heritage . (implements_clause . (type_identifier) @implemented_interface_name)?)?
  body: (class_body) @class_body
) @class_definition

(method_definition name: (property_identifier) @method_name parameters: (formal_parameters) @method_params body: (statement_block) @method_body) @method_definition
(public_field_definition name: (property_identifier) @class_prop_name) @class_property
(interface_declaration name: (type_identifier) @interface_name) @interface_definition
(type_alias_declaration name: (type_identifier) @type_alias_name) @type_alias_definition
(enum_declaration name: (identifier) @enum_name) @enum_definition
; --- Variables & Assignments ---
(lexical_declaration (variable_declarator name: (_) @variable_name)) @variable_declaration
(variable_declaration (variable_declarator name: (_) @variable_name)) @variable_declaration_legacy
(assignment_expression left: (_) @assign_target right: (_) @assign_value) @assignment
; --- Function/Method Calls ---
(call_expression function: (identifier) @call_func_name) @call_expression_direct
(call_expression function: (member_expression object: (_) @call_object property: (property_identifier) @call_method_name)) @call_expression_member
; --- Imports ---
(import_statement source: (string) @import_source) @import_statement
; --- Exports ---
(export_statement) @export_statement
; --- Control Flow ---
(if_statement condition: (_) @if_condition) @if_statement
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

// Function to walk a directory recursively and find .ts files
async function findTsFiles(dir) {
  const files = [];
  let dirCount = 0;
  
  async function scan(directory) {
    dirCount++;
    console.log(`Scanning directory (${dirCount}): ${directory}`);
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const relativePath = path.relative(path.resolve(__dirname, 'twenty/packages/twenty-server'), fullPath);
          files.push('/twenty/packages/twenty-server/' + relativePath.replace(/\\/g, '/'));
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${directory}: ${error.message}`);
    }
  }
  
  await scan(dir);
  console.log(`Scanned ${dirCount} directories in total`);
  return files;
}

// Extract features from file
async function parseFileAndExtractFeatures(filePath) {
  console.log(`\nProcessing file: ${filePath}`);
  try {
    // Simply use the relative path from where the script is located
    const absoluteFilePath = path.resolve(__dirname, 'twenty/packages/twenty-server', filePath.replace('/twenty/packages/twenty-server/', ''));

    const source = await fs.readFile(absoluteFilePath, 'utf8');
    const tree = parser.parse(source);

    const query = new Parser.Query(TypeScript, comprehensiveQueryString);
    const captures = query.captures(tree.rootNode);
    console.log(`  Query captured ${captures.length} nodes.`);

    // --- AGGREGATED FEATURE EXTRACTION ---
    const fileFeatures = {
      filePath: filePath, // Store the original relative path
      featureSets: {
        functionNames: new Set(), classNames: new Set(), methodNames: new Set(),
        classPropNames: new Set(), interfaceNames: new Set(), typeAliasNames: new Set(),
        enumNames: new Set(), variableNames: new Set(), assignTargets: new Set(),
        callFuncNames: new Set(), callMethodNames: new Set(), callObjectTargets: new Set(),
        importSources: new Set(), stringLiterals: new Set(),
        implementedInterfaces: new Set(),
      },
      nodeCounts: {},
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
           try { if(fullText.length < 100 && fullText.length > 2) fileFeatures.featureSets.stringLiterals.add(JSON.parse(fullText)); } // Limit string literal length and ignore empty strings ""
           catch(e) { if(fullText.length < 100 && fullText.length > 2) fileFeatures.featureSets.stringLiterals.add(fullText); } break;
         case 'implemented_interface_name':
           fileFeatures.featureSets.implementedInterfaces.add(fullText);
           break;
       }
    }

    console.log(`  Finished processing: ${filePath}`);
    
    // Convert sets to arrays for consistent handling
    for (const key in fileFeatures.featureSets) {
      if (fileFeatures.featureSets[key] instanceof Set) {
        fileFeatures.featureSets[key] = Array.from(fileFeatures.featureSets[key]);
      }
    }
    
    return fileFeatures;

  } catch (error) {
    // Log FS errors specifically
    if (error.code === 'ENOENT') {
      console.error(`  Error: File not found at calculated path for ${filePath}. Check path logic.`);
    } else {
      console.error(`Error parsing file ${filePath}:`, error.message);
    }
    return null; // Indicate failure
  }
}

// Convert features to CSV records
function featuresToCsvRecords(fileFeatures) {
  const records = [];
  const filename = fileFeatures.filePath;
  
  // Process feature sets
  Object.entries(fileFeatures.featureSets).forEach(([featureType, values]) => {
    if (Array.isArray(values)) {
      values.forEach(value => {
        records.push({
          filename,
          feature_type: featureType,
          feature_value: value,
          combined_feature: `${featureType}_${value}`
        });
      });
    }
  });
  
  // Process node counts
  Object.entries(fileFeatures.nodeCounts).forEach(([nodeType, count]) => {
    const type = `nodeCount_${nodeType}`;
    records.push({
      filename,
      feature_type: type,
      feature_value: count,
      combined_feature: `${type}_${count}`
    });
  });
  
  return records;
}

// Create a CSV string from records
function createCsvString(records) {
  const header = ['Filename', 'Feature Type', 'Feature Value', 'Combined Feature'].join(',');
  const rows = records.map(record => [
    `"${record.filename.replace(/"/g, '""')}"`,
    `"${record.feature_type.replace(/"/g, '""')}"`,
    `"${String(record.feature_value).replace(/"/g, '""')}"`,
    `"${record.combined_feature.replace(/"/g, '""')}"`
  ].join(','));
  
  return [header, ...rows].join('\n');
}

// Main function
async function main() {
  try {
    const baseDir = path.resolve(__dirname, 'twenty/packages/twenty-server');
    console.log(`Scanning for TypeScript files in: ${baseDir}`);
    
    // Find all TypeScript files
    const tsFiles = await findTsFiles(baseDir);
    console.log(`Found ${tsFiles.length} TypeScript files`);
    
    // Process files and collect features
    const allCsvRecords = [];
    let processedCount = 0;
    
    for (const filePath of tsFiles) {
      const features = await parseFileAndExtractFeatures(filePath);
      if (features) {
        const records = featuresToCsvRecords(features);
        allCsvRecords.push(...records);
        processedCount++;
      }
    }
    
    console.log(`Successfully processed ${processedCount} out of ${tsFiles.length} files`);
    
    // Write to CSV using native fs
    const csvContent = createCsvString(allCsvRecords);
    await fs.writeFile('ts_features.csv', csvContent);
    console.log(`CSV file generated successfully with ${allCsvRecords.length} records`);
    
    // Save a copy of the raw features in JSON format (optional)
    await fs.writeFile('all_ts_features.json', JSON.stringify({
      totalFilesProcessed: processedCount,
      totalRecords: allCsvRecords.length,
      records: allCsvRecords
    }, null, 2));
    console.log('JSON backup created successfully');
    
  } catch (error) {
    console.error('Error processing files:', error);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 