const fs = require('fs').promises;
const path = require('path');
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

// Using the same query string from v2_analyse.js
const comprehensiveQueryString = `
; --- Declarations ---
(function_declaration name: (identifier) @function_name parameters: (formal_parameters) @function_params body: (statement_block) @function_body) @function_definition
(class_declaration name: (type_identifier) @class_name body: (class_body) @class_body) @class_definition
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
        const absoluteFilePath = path.resolve(__dirname, 'twenty/packages/twenty-server', filePath.replace('/twenty/packages/twenty-server/', ''));
        console.log('Reading file from:', absoluteFilePath);
        
        const source = await fs.readFile(absoluteFilePath, 'utf8');
        console.log('\nFile contents:', source.substring(0, 150) + '...');

        // Parse the file
        const tree = parser.parse(source);
        const query = new Parser.Query(TypeScript, comprehensiveQueryString);
        const captures = query.captures(tree.rootNode);

        // Initialize feature sets
        const features = {
            interfaces: [],
            classes: [],
            methods: [],
            functions: []
        };

        // Process captures
        captures.forEach(({ name: captureType, node }) => {
            const fullText = node.text;
            
            switch (captureType) {
                case 'interface_name':
                    features.interfaces.push({
                        name: fullText,
                        position: {
                            start: node.startPosition,
                            end: node.endPosition
                        }
                    });
                    break;
                case 'class_name':
                    features.classes.push(fullText);
                    break;
                case 'method_name':
                    features.methods.push(fullText);
                    break;
                case 'function_name':
                    features.functions.push(fullText);
                    break;
            }
        });

        // Print results
        console.log('\nAnalysis Results:');
        console.log('Interfaces found:', features.interfaces.length);
        features.interfaces.forEach(int => {
            console.log(`  - ${int.name} (Line ${int.position.start.row + 1}, Column ${int.position.start.column})`);
        });

        console.log('\nOther features found:');
        console.log('Classes:', features.classes);
        console.log('Methods:', features.methods);
        console.log('Functions:', features.functions);

    } catch (error) {
        console.error('Error analyzing file:', error);
        if (error.code === 'ENOENT') {
            console.error('File not found. Check the path.');
        }
    }
}

// Test with a specific file
const testFile = '/twenty/packages/twenty-server/src/engine/core-modules/email/email-sender.service.ts';
analyzeFile(testFile); 