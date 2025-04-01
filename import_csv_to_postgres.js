const fs = require('fs');
const fsPromises = require('fs').promises;
const { Pool } = require('pg');
const path = require('path');
const readline = require('readline');

// PostgreSQL connection configuration
// Updated with the correct credentials for your Docker container
const pool = new Pool({
  user: 'postgres', // Default PostgreSQL user
  host: 'localhost',
  database: 'postgres', // Default database
  password: 'admin', // The password you set in your Docker command
  port: 5432,
});

async function createTable() {
  const client = await pool.connect();
  try {
    console.log('Creating ast_flat table...');
    await client.query(`
      DROP TABLE IF EXISTS ast_flat;
      CREATE TABLE ast_flat (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        feature_type TEXT NOT NULL,
        feature_value TEXT NOT NULL,
        combined_feature TEXT NOT NULL
      );
    `);
    console.log('Table created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function importCSV(csvFilePath) {
  const client = await pool.connect();
  try {
    console.log(`Importing data from ${csvFilePath}...`);
    
    // Using regular fs module for createReadStream
    const fileStream = fs.createReadStream(csvFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    let batchSize = 1000;
    let values = [];
    let queryText = 'INSERT INTO ast_flat (filename, feature_type, feature_value, combined_feature) VALUES ';
    
    // Process the file line by line
    for await (const line of rl) {
      if (lineCount === 0) {
        // Skip header
        lineCount++;
        continue;
      }
      
      // Parse CSV line (handles quoted values with commas inside)
      const parsed = parseCSVLine(line);
      if (parsed.length < 4) continue; // Skip invalid lines
      
      values.push(
        client.escapeLiteral(parsed[0]), // filename
        client.escapeLiteral(parsed[1]), // feature_type
        client.escapeLiteral(parsed[2]), // feature_value
        client.escapeLiteral(parsed[3])  // combined_feature
      );
      
      if (values.length >= batchSize * 4) {
        // Execute batch insert
        await executeBatchInsert(client, queryText, values);
        values = [];
        console.log(`Imported ${lineCount} records...`);
      }
      
      lineCount++;
    }
    
    // Insert any remaining records
    if (values.length > 0) {
      await executeBatchInsert(client, queryText, values);
    }
    
    console.log(`CSV import completed. Total records: ${lineCount - 1}`);
    
    // Create indexes for better query performance
    console.log('Creating indexes...');
    await client.query('CREATE INDEX idx_ast_filename ON ast_flat(filename);');
    await client.query('CREATE INDEX idx_ast_feature_type ON ast_flat(feature_type);');
    await client.query('CREATE INDEX idx_ast_combined ON ast_flat(combined_feature);');
    console.log('Indexes created successfully');
    
  } catch (error) {
    console.error('Error importing CSV:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function executeBatchInsert(client, queryText, values) {
  let valueStrings = [];
  for (let i = 0; i < values.length; i += 4) {
    valueStrings.push(`(${values[i]}, ${values[i+1]}, ${values[i+2]}, ${values[i+3]})`);
  }
  
  const query = queryText + valueStrings.join(', ');
  await client.query(query);
}

function parseCSVLine(line) {
  const result = [];
  let currentValue = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // If we see a double quote followed by another double quote, it's an escaped quote
      if (i + 1 < line.length && line[i + 1] === '"') {
        currentValue += '"';
        i++; // Skip the next quote
      } else {
        // Toggle the inQuotes flag
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of value
      result.push(currentValue);
      currentValue = '';
    } else {
      // Add character to current value
      currentValue += char;
    }
  }
  
  // Add the last value
  result.push(currentValue);
  return result;
}

async function main() {
  try {
    // Create the table structure
    await createTable();
    
    // Import the CSV data
    const csvFilePath = path.resolve(__dirname, 'ts_features.csv');
    await importCSV(csvFilePath);
    
    console.log('Data import completed successfully');
  } catch (error) {
    console.error('Failed to import data:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 