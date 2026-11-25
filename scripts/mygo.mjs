import { spawn } from "node:child_process";
const child = spawn("mygo", process.argv.slice(2), {
  stdio: "inherit",
  env: {
    ...process.env,
    GOFLAGS: [process.env.GOFLAGS || "", "-buildvcs=false"].join(" "),
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
