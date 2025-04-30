const fs = require('fs').promises;
const path = require('path');
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');

const parser = new Parser();
parser.setLanguage(TypeScript);

async function parseFile(filePath) {
    const source = await fs.readFile(filePath, 'utf8');
    const tree = parser.parse(source);
    
    // Convert tree to JSON-friendly format
    const treeJson = {
        type: tree.rootNode.type,
        startPosition: tree.rootNode.startPosition,
        endPosition: tree.rootNode.endPosition,
        children: getChildren(tree.rootNode)
    };

    // Save to JSON file
    await fs.writeFile('ast-output.json', JSON.stringify(treeJson, null, 2));
    console.log('AST has been saved to ast-output.json');
}

function getChildren(node) {
    const children = [];
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        children.push({
            type: child.type,
            text: child.text,
            startPosition: child.startPosition,
            endPosition: child.endPosition,
            children: getChildren(child)
        });
    }
    return children;
}

parseFile('twenty/packages/twenty-server/src/engine/api/rest/metadata/rest-api-metadata.controller.ts');