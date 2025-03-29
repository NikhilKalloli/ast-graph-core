const fs = require('fs').promises;
const path = require('path');
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// Using the updated query string
// Using the corrected query string
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

async function analyzeFile(filePath) {
    try {
        // Read the file
        // *** IMPORTANT: Adjust the base path if your script is not in the parent directory of 'twenty' ***
        const absoluteFilePath = path.resolve(__dirname, 'twenty/packages/twenty-server', filePath.replace('/twenty/packages/twenty-server/', ''));

        if (!await fs.access(absoluteFilePath).then(() => true).catch(() => false)) {
            console.error(`  File not found or inaccessible: ${absoluteFilePath}`);
            return null; // Return null or throw an error
        }
        console.log('\nReading file from:', absoluteFilePath);
        const source = await fs.readFile(absoluteFilePath, 'utf8');
        // console.log('\nFile contents:', source.substring(0, 150) + '...'); // Optional: Log file start

        // Parse the file
        const tree = parser.parse(source);

        // console.log('Tree:', tree, tree.rootNode, tree.rootNode.type, tree.rootNode.children);

        const query = new Parser.Query(TypeScript, comprehensiveQueryString);
        const captures = query.captures(tree.rootNode);
        console.log(`Query captured ${captures.length} nodes.`);

        // Initialize feature sets
        const features = {
            interfacesDefined: [], // Interfaces defined in THIS file
            classesDefined: [],
            methodsDefined: new Set(), // Use set for unique qualified names
            functionsDefined: [],
            implementations: [] // Store { className: '...', interfaceName: '...' } pairs
        };

        // Process captures
        captures.forEach(({ name: captureType, node }) => {
            const fullText = node.text;

            switch (captureType) {
                case 'interface_name':
                    features.interfacesDefined.push({
                        name: fullText,
                        position: { // Keep position for defined interfaces
                            start: node.startPosition,
                            end: node.endPosition
                        }
                    });
                    break;
                case 'class_name':
                    // Only add if it's directly captured as class_name, not implicitly via implements
                    if (node.parent?.type === 'class_declaration') {
                         features.classesDefined.push(fullText);
                    }
                    break;
                case 'method_name':
                    // Find enclosing class to qualify the method name
                    let methodEnclosingClass = '[UNKNOWN_CLASS]';
                    let current = node.parent;
                    while(current) {
                        if (current.type === 'class_declaration') {
                            const nameNode = current.childForFieldName('name');
                            methodEnclosingClass = nameNode?.text || '[anonymous_class]';
                            break;
                        }
                        current = current.parent;
                    }
                    features.methodsDefined.add(`${methodEnclosingClass}::${fullText}`);
                    break;
                case 'function_name':
                    features.functionsDefined.push(fullText);
                    break;

                // --- HANDLE NEW CAPTURE ---
                case 'implemented_interface_name':
                    const interfaceName = fullText;
                    // Find the class declaration this belongs to
                    let classNode = node.parent;
                    while (classNode && classNode.type !== 'class_declaration') {
                        classNode = classNode.parent;
                    }
                    if (classNode) {
                        const classNameNode = classNode.childForFieldName('name');
                        const className = classNameNode?.text || '[anonymous_class]';
                        features.implementations.push({ className, interfaceName });
                    } else {
                        // Should ideally not happen with the query structure, but good to handle
                        features.implementations.push({ className: '[UNKNOWN_CLASS]', interfaceName });
                    }
                    break;
                 // --- END NEW CAPTURE HANDLING ---
            }
        });

        // Convert Set to Array for consistent output
        features.methodsDefined = Array.from(features.methodsDefined);

        // Print results
        console.log('\n--- Analysis Results for:', filePath, '---');
        console.log('Interfaces Defined:', features.interfacesDefined.length);
        features.interfacesDefined.forEach(int => {
            console.log(`  - ${int.name} (Line ${int.position.start.row + 1})`);
        });

        console.log('\nClasses Defined:', features.classesDefined);
        console.log('\nMethods Defined:', features.methodsDefined);
        console.log('\nFunctions Defined:', features.functionsDefined);

        console.log('\nInterface Implementations:', features.implementations.length);
        features.implementations.forEach(impl => {
            console.log(`  - Class '${impl.className}' implements Interface '${impl.interfaceName}'`);
        });
        console.log('--- End Analysis Results ---');

        return features; // Return the extracted features

    } catch (error) {
        console.error(`Error analyzing file ${filePath}:`, error);
        if (error.code === 'ENOENT') {
            console.error('File not found. Check the path logic and ensure the file exists.');
        }
        return null; // Return null on error
    }
}

// Test with a specific file
const testFile = '/twenty/packages/twenty-server/src/engine/core-modules/email/email-sender.service.ts';
analyzeFile(testFile);