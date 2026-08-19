import { pool } from '../../config/database.js';

export async function findUserByEmail(email) {
    const {rows}=await pool.query(
        'SELECT id, username, email, password_hash, created_at FROM users WHERE email=$1',
        [email]
    );

    return rows[0]||null;
}

/*export async function createUser({ username, email, passwordHash }) { — notice the parameter here is destructured directly in the function signature — instead of taking three separate arguments (createUser(username, email, passwordHash)), we take one object and pull the three fields out of it immediately.*/

/*RETURNING id, username, email, created_at — this is a genuinely useful Postgres-specific feature worth highlighting. Normally, an INSERT just... inserts, and tells you nothing back except "it worked." RETURNING tells Postgres: "after inserting this row, hand me back these specific columns from the row you just created" — in one single round-trip, instead of doing a separate INSERT followed by a separate SELECT to fetch the same row we just created. */

export async function createUser({username,email,passwordHash}) {
    const {rows}= await pool.query(
        `INSERT INTO users (username,email,password_hash) 
        VALUES ($1,$2,$3)
        RETURNING id,username,email,created_at`,
        [username,email,passwordHash]
    );

    return rows[0];
}

