const fs = require("fs");
const src = "C:/Users/lewis/.cursor/projects/c-Users-lewis-Documents-luxor-event-space/agent-tools/ac0b3c1b-36bd-407d-a5ad-888cfe9917af.txt";
const dest = "C:/Users/lewis/.cursor/projects/c-Users-lewis-Documents-luxor-event-space/agent-tools/phase3.txt";
const j = JSON.parse(fs.readFileSync(src, "utf8"));
const t = j.plaintextBody || "";
fs.writeFileSync(dest, t);
console.log(t.length);
