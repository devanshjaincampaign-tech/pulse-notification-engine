/*What is pool?
Instead of "wait for many queries to pile up, then hit the database once," it's "keep a small set of ready-to-use connections alive, and hand them out and reclaim them per-query, so we skip paying the expensive setup cost every single time."
*/

import pg from 'pg';

/*The pg package doesn't export things the "clean" ESM way you might expect (import { Pool } from 'pg' directly) — it's an older package written primarily for CommonJS, so when used from ESM you import the whole package as one object (pg), then pull out the specific piece you need from it (Pool) using object destructuring. const { Pool } = pg just means "take the Pool property out of the pg object and give me a variable called Pool pointing to it directly." Without this, you'd have to write pg.Pool everywhere instead of just Pool. */
import {env} from './env.js';

const {Pool} =pg;

export const pool=new Pool({
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    host: env.db.host,
    port: env.db.port,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error',(err)=>{
    console.error('unexpected error on idle postgres client',err);
    process.exit(1);

    
});

/*This is an event listener — pool is capable of emitting an 'error' event on its own, independent of any specific query, if something goes wrong with a connection that's just sitting idle in the pool (e.g., Postgres unexpectedly restarts, network drops). Without this listener, an error like that could crash our Node process with an unhandled error — this way, we catch it explicitly, log it clearly, and exit deliberately (same fail-fast reasoning again: better to go down loudly and get restarted than run in a half-broken state). */

export async function testConnection(){
    const client= await pool.connect();
    try{
        await client.query('SELECT 1');
        console.log('Postgres connection successful');
    }
    finally{
        client.release();
    }
}

/*This is a small utility function we'll actually call from server.js shortly, purely to prove, at startup, that we can genuinely reach Postgres — not just that we configured a pool object (configuring it doesn't guarantee the database is actually reachable) */

/*What's the actual difference between process.exit(1) and process.exit(0) — what does the number mean, and who "reads" it?

Every process that runs on your computer — not just Node, literally every program, ls, git, anything — ends by returning a number to the operating system called an exit code. This is a decades-old Unix convention, not something Node invented.
The convention:

0 = "I finished successfully, nothing went wrong."
Any non-zero number (1, 2, etc.) = "something went wrong." The specific number can sometimes mean something more precise depending on the program, but in most everyday code, people just use 1 as a generic "failure" signal.*/