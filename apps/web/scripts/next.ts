async function envFromFile(path: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  const file = Bun.file(path);
  if (!(await file.exists())) return env;

  for (const raw of (await file.text()).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const index = body.indexOf("=");
    if (index <= 0) continue;
    const key = body.slice(0, index).trim();
    let value = body.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const root = process.cwd();
const fileEnv = await envFromFile(`${root}/.env.local`);
const nextBin = `${root}/node_modules/next/dist/bin/next`;

const child = Bun.spawn([process.execPath, nextBin, ...process.argv.slice(2)], {
  cwd: root,
  env: { ...fileEnv, ...process.env },
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(await child.exited);

export {};
