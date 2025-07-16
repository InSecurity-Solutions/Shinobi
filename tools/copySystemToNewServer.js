const path = require('path');
const fs   = require('fs').promises;
const { spawn } = require('child_process');
const { Client } = require('ssh2');
const os   = require('os');

// ── Shinobi helpers ───────────────────────────────────────────────────────────
const configRaw = require('../conf.json');              // <- will be copied
const s         = require('../libs/process.js')(process);
const config    = require('../libs/config.js')(s);
const s2        = { mainDirectory: process.cwd() };

// ── CLI parsing ───────────────────────────────────────────────────────────────
const [
  , , host,
  sshUsername,
  sshPassword,
  sqlUsername  = 'majesticflame',
  sqlPassword  = '',
  sqlDatabase  = 'ccio',
  sqlPort      = 3306,
  shinobiPath  = '/home/Shinobi',              // <─ NEW default
] = process.argv.map(String);

if (!host || !sshUsername || !sshPassword || !sqlUsername) {
    console.log(`** Invalid parameters provided!`)
    if(!host)console.log('Missing Host!')
    if(!sshUsername)console.log('Missing SSH Username!')
    if(!sshPassword)console.log('Missing SSH Password!')
    console.log(`## Example Usage :`)
    console.log(`=============`)
    console.log('node tools/copySystemToNewServer.js HOST SSH_USER SSH_PASS SQL_USER SQL_PASS SQL_DB SQL_PORT SHINOBI_PATH');
    console.log(`=============`)
    console.log(`## Usage Parameters :`)
    console.log(`=============`)
    console.log(`# HOST : The Server IP Address or Domain Name. Required.`)
    console.log(`# SSH_USER : The username to login to SSH. Required.`)
    console.log(`# SSH_PASS : The password to login to SSH. To use RSA passwordless login do "__RSA:/path/to/keyfile". Required.`)
    console.log(`# SQL_USER : The username for the MySQL (MariaDB) DATABASE. Default is "majesticflame". Optional.`)
    console.log(`# SQL_PASS : The password for the MySQL (MariaDB) DATABASE. Default is blank. Optional.`)
    console.log(`# SQL_DB : The database name. Default is "ccio". Optional.`)
    console.log(`# SQL_PORT : The database port. Default is "3306". Optional.`)
    console.log(`# SHINOBI_PATH : The path where Shinobi is installed. Default is "/home/Shinobi" Optional.`)
    console.log(`=============`)
    process.exit(1);
}

// ── Source-side DB info (conf.json) ───────────────────────────────────────────
const localDbConf = (configRaw.db || {
  host    : '127.0.0.1',
  user    : 'majesticflame',
  password: '',
  database: 'ccio',
  port    : 3306,
});

// ── Paths ─────────────────────────────────────────────────────────────────────
const dumpName   = `shinobi_dump_${Date.now()}.sql`;
const dumpPath   = path.join(os.tmpdir(), dumpName);
const remoteDump = `/tmp/${dumpName}`;

const localTmpConf  = path.join(os.tmpdir(), `shinobi_conf_${Date.now()}.json`);
const remoteConf    = `${shinobiPath.replace(/\/+$/, '')}/conf.json`;

// ── Helper — promisified spawn ------------------------------------------------
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

// ── 1. Dump the local database ───────────────────────────────────────────────
async function dumpLocalDb() {
  console.log(`\n[1/5] Dumping local DB ⇒ ${dumpPath}`);
  const args = [
    `-h${localDbConf.host}`,
    `-P${localDbConf.port}`,
    `-u${localDbConf.user}`,
    `-p${localDbConf.password}`,
    '--single-transaction', '--routines', '--triggers',
    localDbConf.database,
  ];
  await run('mysqldump', args, {
    stdio: ['ignore', await fs.open(dumpPath, 'w'), 'inherit'],
  });
  console.log('    ✓ Dump complete');
}

// ── SSH helpers ───────────────────────────────────────────────────────────────
function connectSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const opts = { host, port: 22, username: sshUsername };

    if (sshPassword.startsWith('__RSA:')) {
      opts.privateKey = require('fs').readFileSync(sshPassword.slice(6));
    } else {
      opts.password = sshPassword;
    }

    conn.on('ready', () => resolve(conn))
        .on('error', reject)
        .connect(opts);
  });
}

function getSftp(conn) {
  return new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
}

// ── 2. Copy dump to target ────────────────────────────────────────────────────
async function uploadDump(conn, sftp) {
  console.log(`[2/5] Uploading dump ⇒ ${host}:${remoteDump}`);
  await new Promise((res, rej) =>
    sftp.fastPut(dumpPath, remoteDump, {}, err => (err ? rej(err) : res())),
  );
  console.log('    ✓ Upload complete');
}

// ── 3. Copy conf.json to target ───────────────────────────────────────────────
async function uploadConf(conn, sftp) {
  console.log(`[3/5] Uploading conf.json ⇒ ${host}:${remoteConf}`);
  // 3a. make sure remote Shinobi dir exists
  await new Promise((resolve, reject) => {
    conn.exec(`mkdir -p '${shinobiPath.replace(/'/g, `'\\''`)}'`, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', code => (code === 0 ? resolve() : reject(new Error(`mkdir exited ${code}`))));
    });
  });

  // 3b. write local temp conf then push
  await fs.writeFile(localTmpConf, JSON.stringify(configRaw, null, 2));
  await new Promise((res, rej) =>
    sftp.fastPut(localTmpConf, remoteConf, {}, err => (err ? rej(err) : res())),
  );
  console.log('    ✓ conf.json uploaded');
}

// ── 4. Ensure DB / privileges on target ──────────────────────────────────────
async function ensureDatabase(conn) {
  console.log('[4/6] Ensuring database & privileges …');

  const pwdClause = sqlPassword
    ? `IDENTIFIED BY '${sqlPassword.replace(/'/g, `'\\''`)}'`
    : '';

  const sql = `
    CREATE DATABASE IF NOT EXISTS \\\`${sqlDatabase}\\\`;
    GRANT ALL PRIVILEGES ON \\\`${sqlDatabase}\\\`.* TO '${sqlUsername}'@'127.0.0.1' ${pwdClause};
    FLUSH PRIVILEGES;
  `;

  const cmd = [
    'mysql',
    `-u${sqlUsername}`,
    sqlPassword ? `-p'${sqlPassword.replace(/'/g, `'\\''`)}'` : '',
    `-P${sqlPort}`,
    `-e "${sql.replace(/\n/g, ' ')}"`,
  ].join(' ');

  await new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', code => (code === 0 ? resolve() : reject(new Error(`mysql exited ${code}`))))
            .stderr.pipe(process.stderr);
      stream.pipe(process.stdout);
    });
  });
  console.log('    ✓ Database ready');
}

// ── 5. Restore DB on target ───────────────────────────────────────────────────
async function importOnTarget(conn) {
  console.log('[5/6] Importing dump on target …');

  const restoreCmd = [
    `mysql`,
    `-u${sqlUsername}`,
    sqlPassword ? `-p'${sqlPassword.replace(/'/g, `'\\''`)}'` : '',
    `-P${sqlPort}`,
    `${sqlDatabase} < ${remoteDump}`,
  ].join(' ');

  await new Promise((resolve, reject) => {
    conn.exec(restoreCmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', code => (code === 0 ? resolve() : reject(new Error(`mysql exited ${code}`))))
            .stderr.pipe(process.stderr);
      stream.pipe(process.stdout);
    });
  });
  console.log('    ✓ Import complete');
}

// ── 6. Cleanup ────────────────────────────────────────────────────────────────
async function cleanup(conn) {
  console.log('[6/6] Cleaning up …');
  await fs.unlink(dumpPath).catch(() => {});
  await fs.unlink(localTmpConf).catch(() => {});
  await new Promise(res => {
    conn.exec(`rm -f '${remoteDump}'`, () => res()); // ignore errors
  });
  conn.end();
  console.log('    ✓ All done!');
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
(async () => {
  try {
    await dumpLocalDb();

    const conn = await connectSSH();
    const sftp = await getSftp(conn);

    await uploadDump(conn, sftp);
    await uploadConf(conn, sftp);
    await ensureDatabase(conn);
    await importOnTarget(conn);
    await cleanup(conn);
  } catch (err) {
    console.error('‼  Error:', err.message);
    process.exit(1);
  }
})();
