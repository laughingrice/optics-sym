const fs = require('fs');
const s = fs.readFileSync('app.js','utf8');
const pairs = {'(':0,'{':0,'[':0};
for(let i=0;i<s.length;i++){
  const c = s[i];
  if(c in pairs) pairs[c]++;
  if(c===')') pairs['(']--;
  if(c==='}') pairs['{']--;
  if(c===']') pairs['[']--;
  if(pairs['(']<0 || pairs['{']<0 || pairs['[']<0){
    console.log('unbalanced at', i, s.slice(Math.max(0,i-40), i+40)); process.exit(1);
  }
}
console.log('final counts', pairs);
