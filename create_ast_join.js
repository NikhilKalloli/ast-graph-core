const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'admin',
  port: 5432,
});

async function createJoinTable() {
  const client = await pool.connect();
  try {
    // First, let's get the count of records to estimate time
    console.log('Counting records in ast_flat table...');
    const countResult = await client.query('SELECT COUNT(*) FROM ast_flat');
    const totalRecords = parseInt(countResult.rows[0].count);
    console.log(`Total records in ast_flat: ${totalRecords}`);

    // Create the join table with proper indexes
    console.log('Creating ast_flat_join table...');
    await client.query(`
      DROP TABLE IF EXISTS ast_flat_join;
      CREATE TABLE ast_flat_join (
        id SERIAL PRIMARY KEY,
        f1 TEXT NOT NULL,
        type_value_1 TEXT NOT NULL,
        f2 TEXT NOT NULL,
        type_value_2 TEXT NOT NULL
      );
    `);

    // Perform the join in batches to avoid memory issues
    console.log('Performing join operation...');
    await client.query(`
      INSERT INTO ast_flat_join (f1, type_value_1, f2, type_value_2)
      SELECT 
        a.filename AS f1,
        a.combined_feature AS type_value_1,
        b.filename AS f2,
        b.combined_feature AS type_value_2
      FROM ast_flat a
      JOIN ast_flat b ON (a.combined_feature = b.combined_feature)
      WHERE a.filename < b.filename  -- Avoid symmetric duplicates
    `);

    // Create indexes for better query performance
    console.log('Creating indexes on ast_flat_join...');
    await client.query('CREATE INDEX idx_join_f1 ON ast_flat_join(f1);');
    await client.query('CREATE INDEX idx_join_f2 ON ast_flat_join(f2);');
    await client.query('CREATE INDEX idx_join_type_value_1 ON ast_flat_join(type_value_1);');

    // Get statistics about the join
    const joinCountResult = await client.query('SELECT COUNT(*) FROM ast_flat_join');
    console.log(`Total records in ast_flat_join: ${joinCountResult.rows[0].count}`);

    // Get sample of joined data
    console.log('\nSample of joined data:');
    const sampleResult = await client.query('SELECT * FROM ast_flat_join LIMIT 5');
    console.table(sampleResult.rows);

    // Get some statistics about file pairs
    console.log('\nTop 5 file pairs with most shared features:');
    const statsResult = await client.query(`
      SELECT f1, f2, COUNT(*) as shared_features
      FROM ast_flat_join
      GROUP BY f1, f2
      ORDER BY shared_features DESC
      LIMIT 5
    `);
    console.table(statsResult.rows);

  } catch (error) {
    console.error('Error creating join table:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.time('Total execution time');
  try {
    await createJoinTable();
    console.log('Join table creation completed successfully');
  } catch (error) {
    console.error('Failed to create join table:', error);
  } finally {
    await pool.end();
    console.timeEnd('Total execution time');
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 